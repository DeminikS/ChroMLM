import logging
import json
import re
import pandas as pd
from datasets import load_dataset, concatenate_datasets, Dataset
from openai import OpenAI, APIError, RateLimitError, APIConnectionError
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from collections import defaultdict
import time # To potentially add delays for rate limiting

# --- Phase 1: Setup and Configuration ---

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Configuration Variables
# Hugging Face Datasets
NON_MLM_DATASET = "Deminik/POST_DATA"
MLM_DATASET = "Deminik/MLM_POST_DATA"
# Models to test (Update with your actual LM Studio model identifiers)
MODELS_TO_TEST = [
    "bielik-11b-v2.2-instruct", # Example, replace with yours
    # Add other model identifiers here
]
# LM Studio API Configuration
LMSTUDIO_BASE_URL = "http://localhost:1234/v1"
LMSTUDIO_API_KEY = "lm-studio" # Default for LM Studio, change if needed
# Output File
OUTPUT_CSV_FILE = "llm_evaluation_results.csv"
# Ground Truth Column Name
GROUND_TRUTH_LABEL = "is_mlm"

# LLM Prompt Structure (System Prompt)
SYSTEM_PROMPT = (
    "You are an expert in identifying multi-level marketing (MLM) schemes on social media. "
    "Analyze the given social media post data (profile bio, post content, tags, comments) "
    "for characteristics of MLM. Provide your response in valid JSON format only. "
    "Do not include code block markers (```json ... ```) or any text outside the JSON object. "
    "The JSON object must include the following keys:\n"
    "- 'verdict': A 'Yes' or 'No' indicating if the content is MLM.\n"
    "- 'certainty': A percentage (0-100) representing how certain you are.\n"
    "- 'reasoning': A brief explanation for your verdict." # Simplified reasoning for easier processing
)

# Rate limiting delay (seconds) - adjust if needed
API_DELAY = 1 # Add a small delay between API calls

# --- Phase 2: Data Loading and Preprocessing ---

def parse_tags(tags_str: str | None) -> list[str]:
    """Parses a comma-separated string of tags into a list."""
    if not tags_str or not isinstance(tags_str, str):
        return []
    try:
        return [tag.strip() for tag in tags_str.split(',') if tag.strip()]
    except Exception as e:
        logging.warning(f"Could not parse tags '{tags_str}': {e}")
        return []

def parse_comments(comment_str: str | None) -> list[dict]:
    """Parses the combined comments string into a list of comment dictionaries."""
    comments_list = []
    if not comment_str or not isinstance(comment_str, str):
        return comments_list
    try:
        # Split by semicolon followed by optional space, potentially preceded by emoji/space
        # Look for patterns like 'user: comment text'
        raw_comments = re.split(r';\s*', comment_str)
        for raw_comment in raw_comments:
            if not raw_comment.strip():
                continue
            # Try to extract text after the first colon, assuming 'user: text' format
            match = re.match(r"^\s*[^:]+:\s*(.*)", raw_comment.strip())
            if match:
                comment_text = match.group(1).strip()
                comments_list.append({"comment": comment_text})
            else:
                # If no colon pattern, add the whole segment as a comment
                comments_list.append({"comment": raw_comment.strip()})
        return comments_list
    except Exception as e:
        logging.warning(f"Could not parse comments string '{comment_str[:100]}...': {e}")
        # Return the raw string as a single comment object on error
        return [{"comment": comment_str}]

def standardize_data(row: dict) -> dict:
    """Standardizes a row from the Hugging Face dataset."""
    # Safely get values, providing defaults
    profile_bio = row.get("Profile_bio")
    follower_count = row.get("Profile_followerCount")
    post_title = row.get("Post_title")
    post_tags_raw = row.get("Post_tags")
    comments_raw = row.get("Comments")

    # Handle potential type issues or None values
    try:
        follower_count = int(follower_count) if follower_count is not None else 0
    except (ValueError, TypeError):
        follower_count = 0

    parsed_tags = parse_tags(post_tags_raw)
    parsed_comments = parse_comments(comments_raw)

    # Construct the standardized dictionary
    standardized = {
        "profile": {
            "username": row.get("Profile_nickname", "N/A"), # Use nickname as username
            "nickname": row.get("Profile_nickname", "N/A"),
            "bio": profile_bio if isinstance(profile_bio, str) else "",
            "verified": bool(row.get("Profile_verified", False)),
            "bioLinks": row.get("Profile_biolinks"), # Allow None
            "followerCount": follower_count,
            "followingCount": row.get("Profile_followingCount", 0)
        },
        "post": {
            "title": post_title if isinstance(post_title, str) else "",
            "tags": parsed_tags
        },
        "comments": parsed_comments
    }
    return standardized

def load_and_prepare_data(mlm_repo: str, non_mlm_repo: str) -> Dataset:
    """Loads MLM and non-MLM datasets, adds labels, and combines them."""
    logging.info(f"Loading MLM dataset from {mlm_repo}...")
    mlm_ds = load_dataset(mlm_repo, split='train') # Assuming default split is 'train'
    logging.info(f"Loading non-MLM dataset from {non_mlm_repo}...")
    non_mlm_ds = load_dataset(non_mlm_repo, split='train')

    logging.info("Adding ground truth labels...")
    mlm_ds = mlm_ds.map(lambda x: {GROUND_TRUTH_LABEL: 1})
    non_mlm_ds = non_mlm_ds.map(lambda x: {GROUND_TRUTH_LABEL: 0})

    logging.info("Combining datasets...")
    combined_ds = concatenate_datasets([mlm_ds, non_mlm_ds])
    logging.info(f"Combined dataset size: {len(combined_ds)} rows")

    combined_ds = combined_ds.shuffle(seed=42)

    return combined_ds

# --- Phase 3: LLM Interaction ---

# Initialize OpenAI client (pointed to LM Studio)
client = OpenAI(base_url=LMSTUDIO_BASE_URL, api_key=LMSTUDIO_API_KEY)

def classify_mlm_content(standardized_data: dict, model_identifier: str) -> dict:
    """Sends standardized data to the specified LLM and parses the response."""
    result = {
        "verdict": None,
        "certainty": None,
        "reasoning": None,
        "error": None,
        "raw_response": None
    }

    # Construct the input message for the LLM
    profile = standardized_data.get("profile", {})
    post = standardized_data.get("post", {})
    comments = standardized_data.get("comments", [])

    input_message_parts = [
        f"Profile Bio: {profile.get('bio', 'N/A')}",
        f"Follower Count: {profile.get('followerCount', 'N/A')}",
        f"Post Title/Caption: {post.get('title', 'N/A')}",
        f"Post Tags: {', '.join(post.get('tags', [])) if post.get('tags') else 'None'}",
        f"Comments: {[c.get('comment', '') for c in comments]}" # Extract comment text
    ]
    input_message = "\n".join(input_message_parts)

    try:
        # Add delay before API call
        time.sleep(API_DELAY)

        response = client.chat.completions.create(
            model=model_identifier,
            messages=[
            {"role": "system",
             "content": (
                 "You are an expert in identifying multi-level marketing (MLM) schemes. "
                 "Analyze the given social media post for characteristics of MLM and provide your response in valid JSON format only. "
                 "Do not include code block markers or additional text outside the JSON. The JSON should include the following keys: \n"
                 "- 'verdict': A 'Yes' or 'No' indicating if the content is MLM.\n"
                 "- 'certainty': A percentage (0-100) representing how certain you are.\n"
                 "- 'reasoning': An object containing detailed explanations for different factors contributing to your verdict."
             )},
            {"role": "user", "content": input_message}
        ],
        temperature=0.1,
        stream=False
        )

        raw_response_content = response.choices[0].message.content
        result["raw_response"] = raw_response_content

        # Attempt to parse JSON
        try:
            # Remove potential markdown code block markers
            if raw_response_content.startswith("```json") and raw_response_content.endswith("```"):
                cleaned_response = raw_response_content[7:-3].strip()
            elif raw_response_content.startswith("```") and raw_response_content.endswith("```"):
                 cleaned_response = raw_response_content[3:-3].strip()
            else:
                cleaned_response = raw_response_content.strip()

            # Find the first '{' and last '}' to handle potential leading/trailing text
            json_start = cleaned_response.find('{')
            json_end = cleaned_response.rfind('}')
            if json_start != -1 and json_end != -1 and json_end > json_start:
                json_str = cleaned_response[json_start:json_end+1]
            else:
                raise json.JSONDecodeError("No valid JSON object found", cleaned_response, 0)

            parsed_json = json.loads(json_str)

            # Validate required keys (case-insensitive check for flexibility)
            verdict = parsed_json.get('verdict') or parsed_json.get('Verdict')
            certainty = parsed_json.get('certainty') or parsed_json.get('Certainty')
            reasoning = parsed_json.get('reasoning') or parsed_json.get('Reasoning')

            if verdict is None or certainty is None:
                 raise ValueError("Missing 'verdict' or 'certainty' in JSON response")

            # Normalize verdict
            if isinstance(verdict, str):
                 verdict = verdict.strip().capitalize()
                 if verdict not in ['Yes', 'No']:
                      raise ValueError(f"Invalid verdict value: {verdict}")
            else:
                 raise ValueError(f"Verdict is not a string: {verdict}")

            # Normalize certainty
            try:
                 certainty = int(certainty)
                 if not (0 <= certainty <= 100):
                     raise ValueError(f"Certainty out of range: {certainty}")
            except (ValueError, TypeError):
                 raise ValueError(f"Invalid certainty value: {certainty}")

            result["verdict"] = verdict
            result["certainty"] = certainty
            result["reasoning"] = str(reasoning) if reasoning is not None else ""

        except json.JSONDecodeError as e:
            logging.error(f"Failed to parse JSON response for model {model_identifier}: {e}. Response: {raw_response_content}")
            result["error"] = f"JSON Decode Error: {e}"
        except ValueError as e:
             logging.error(f"Invalid JSON content for model {model_identifier}: {e}. Response: {raw_response_content}")
             result["error"] = f"JSON Content Error: {e}"
        except Exception as e: # Catch any other parsing errors
            logging.error(f"Error processing LLM response content for model {model_identifier}: {e}. Response: {raw_response_content}")
            result["error"] = f"Response Processing Error: {e}"

    except APIConnectionError as e:
        logging.error(f"LM Studio API Connection Error for model {model_identifier}: {e}")
        result["error"] = f"API Connection Error: {e}"
    except RateLimitError as e:
        logging.error(f"LM Studio Rate Limit Error for model {model_identifier}: {e}")
        result["error"] = f"Rate Limit Error: {e}. Consider increasing API_DELAY."
    except APIError as e:
        logging.error(f"LM Studio API Error for model {model_identifier}: {e.status_code} - {e.response}")
        result["error"] = f"API Error {e.status_code}: {e}"
    except Exception as e:
        logging.error(f"Unexpected error during API call for model {model_identifier}: {e}")
        result["error"] = f"Unexpected API Error: {e}"

    return result

# --- Phase 4: Evaluation Loop ---

def run_evaluation():
    """Runs the full evaluation process."""
    # Load Data
    combined_ds = load_and_prepare_data(MLM_DATASET, NON_MLM_DATASET)

    all_results = []
    total_rows = len(combined_ds)
    processed_count = 0

    logging.info("Starting evaluation loop...")
    for model_id in MODELS_TO_TEST:
        logging.info(f"--- Evaluating Model: {model_id} ---")
        model_start_time = time.time()
        for i, row in enumerate(combined_ds):
            processed_count += 1
            post_link = row.get("Post link", f"Row_{i}") # Use Post link or row index as identifier
            logging.debug(f"Processing row {i+1}/{total_rows} for model {model_id} (Link: {post_link})")

            # Standardize
            standardized_data = standardize_data(row)

            # Classify
            llm_result = classify_mlm_content(standardized_data, model_id)

            # Process result
            predicted_label = -1 # Default for error/invalid
            raw_verdict = llm_result.get("verdict")
            if llm_result.get("error") is None and raw_verdict:
                if raw_verdict == 'Yes':
                    predicted_label = 1
                elif raw_verdict == 'No':
                    predicted_label = 0
                # Else: remains -1 if verdict is not 'Yes' or 'No'

            result_row = {
                "model_id": model_id,
                "post_link": post_link,
                GROUND_TRUTH_LABEL: row[GROUND_TRUTH_LABEL],
                "predicted_label": predicted_label,
                "raw_verdict": raw_verdict,
                "certainty": llm_result.get("certainty"),
                "reasoning": llm_result.get("reasoning", ""),
                "error_info": llm_result.get("error"),
                "raw_response": llm_result.get("raw_response")
            }
            all_results.append(result_row)

            # Log progress periodically
            if (i + 1) % 50 == 0:
                logging.info(f"Model {model_id}: Processed {i + 1}/{total_rows} rows...")

        model_end_time = time.time()
        logging.info(f"--- Finished Model: {model_id} in {model_end_time - model_start_time:.2f} seconds ---")

    logging.info(f"Finished processing all {processed_count} rows across {len(MODELS_TO_TEST)} models.")
    return all_results

# --- Phase 5: Results Analysis and Output ---

def calculate_metrics(df_model: pd.DataFrame) -> dict:
    """Calculates evaluation metrics for a single model's results."""
    total_predictions = len(df_model)
    errors = df_model['error_info'].notna() | (df_model['predicted_label'] == -1)
    error_count = errors.sum()
    error_rate = (error_count / total_predictions) * 100 if total_predictions > 0 else 0

    # Filter out errors for classification metrics
    valid_df = df_model[~errors]
    y_true = valid_df[GROUND_TRUTH_LABEL]
    y_pred = valid_df['predicted_label']

    if len(valid_df) == 0:
        logging.warning(f"No valid predictions for model {df_model['model_id'].iloc[0]} to calculate metrics.")
        return {
            "Error Rate (%)": error_rate,
            "Accuracy": 0, "Precision": 0, "Recall": 0, "F1-Score": 0,
            "Valid Predictions": 0, "Total Predictions": total_predictions
        }

    accuracy = accuracy_score(y_true, y_pred)
    # Use pos_label=1 for MLM class, zero_division=0 to handle cases with no true/predicted positives
    precision = precision_score(y_true, y_pred, pos_label=1, zero_division=0)
    recall = recall_score(y_true, y_pred, pos_label=1, zero_division=0)
    f1 = f1_score(y_true, y_pred, pos_label=1, zero_division=0)

    return {
        "Error Rate (%)": round(error_rate, 2),
        "Accuracy": round(accuracy, 4),
        "Precision": round(precision, 4),
        "Recall": round(recall, 4),
        "F1-Score": round(f1, 4),
        "Valid Predictions": len(valid_df),
        "Total Predictions": total_predictions
    }

def analyze_and_output_results(all_results: list):
    """Analyzes results, saves detailed CSV, and prints summary metrics."""
    if not all_results:
        logging.warning("No results to analyze.")
        return

    results_df = pd.DataFrame(all_results)

    # Save detailed results
    try:
        results_df.to_csv(OUTPUT_CSV_FILE, index=False, encoding='utf-8')
        logging.info(f"Detailed results saved to {OUTPUT_CSV_FILE}")
    except Exception as e:
        logging.error(f"Failed to save results to CSV: {e}")

    # Calculate and print summary metrics
    summary_metrics = defaultdict(dict)
    print("\n--- Evaluation Summary ---")
    print("-" * 70)

    for model_id in MODELS_TO_TEST:
        df_model = results_df[results_df['model_id'] == model_id]
        if df_model.empty:
            logging.warning(f"No results found for model: {model_id}")
            continue

        metrics = calculate_metrics(df_model)
        summary_metrics[model_id] = metrics

        print(f"Model: {model_id}")
        print(f"  - Total Predictions: {metrics['Total Predictions']}")
        print(f"  - Valid Predictions: {metrics['Valid Predictions']}")
        print(f"  - Error Rate:        {metrics['Error Rate (%)']}%")
        print(f"  - Accuracy:          {metrics['Accuracy']:.4f}")
        print(f"  - Precision (MLM):   {metrics['Precision']:.4f}")
        print(f"  - Recall (MLM):      {metrics['Recall']:.4f}")
        print(f"  - F1-Score (MLM):    {metrics['F1-Score']:.4f}")
        print("-" * 70)

    # You can also return the summary_metrics dict if needed elsewhere
    # return summary_metrics


# --- Main Execution ---
if __name__ == "__main__":
    evaluation_results = run_evaluation()
    analyze_and_output_results(evaluation_results)
    logging.info("Evaluation script finished.")