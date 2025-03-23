import json
import sys
from openai import OpenAI
from src.DataStandardization.Standardizer import run as standard_data
from loguru import logger as log

# Set up LM Studio client
client = OpenAI(base_url="http://localhost:1234/v1", api_key="lm-studio")

# Load the standardized TikTok and Instagram data
def load_standardized_data(file_path):
    log.info(f"Loading standardized data from {file_path}")
    with open(file_path, 'r', encoding='utf-8') as file:
        return json.load(file)

def classify_mlm_content(data):
    log.info("Classifying MLM content")
    # Create a message to classify the content for MLM characteristics
    profile = data.get("profile", {})
    post = data.get("post", {})
    comments = data.get("comments", [])

    # Construct the input message
    input_message = (
        f"Profile Bio: {profile.get('bio')}, Follower Count: {profile.get('followerCount')}\n"
        f"Post Title: {post.get('title')}\n"
        f"Post Tags: {', '.join(post.get('tags')) if post.get('tags') else 'None'}\n"
        f"Comments: {[comment['comment'] for comment in comments]}"
    )

    model_identifier = "model-identifier"  # Make the model identifier configurable
    log.debug(f"Input message for model: {input_message}")
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

    # Extract and return the result in JSON format
    result = response.choices[0].message.content
    try:
        # Remove code block markers if present
        if result.startswith("```json") and result.endswith("```"):
            result = result[7:-3].strip()
        # Attempt to parse JSON using the built-in JSON library for robustness
        result_json = json.loads(result)
        log.info("Successfully classified MLM content")
    except json.JSONDecodeError:
        log.error("Failed to parse model response as JSON")
        result_json = {
            "verdict": "Error",
            "certainty": 0,
            "reasoning": {
                "error": "The model response could not be parsed as JSON."
            }
        }

    return result_json


async def analyze_post(url):
    log.remove()
    log.add(sys.stderr, level="DEBUG")
    log.info("Sending data for analysis.")
    try:
        # Use `await` instead of `asyncio.run` for async functions
        log.info("Loading data for analysis.")
        data = await standard_data(url)
        analysis = classify_mlm_content(data)
        log.info(f"MLM Analysis: {json.dumps(analysis, indent=2)}")
        log.success("Successfully analyzed data.")
        return analysis
    except Exception as e:
        log.exception("An error occurred during execution.")
        return {"error": str(e)}



# Main execution
if __name__ == "__main__":

    log.remove()  # remove the old handler. Else, the old one will work along with the new one you've added below
    log.add(sys.stderr, level="DEBUG")
    # log.add("mlm_analysis.log", rotation="1 MB", retention="10 days")

    log.info("Sending data for analysis.")

    try:
        # Load data from provided standardized JSON files
        log.info("Loading TikTok data for analysis.")
        tiktok_mlm_analysis = analyze_post("https://www.tiktok.com/@tiktok_poland/video/7440071783539150087")
        log.info("Loading Instagram data for analysis.")
        instagram_mlm_analysis = analyze_post("https://www.instagram.com/p/CTwgvhTMSqM/")
        # Analyze the TikTok post for MLM characteristics
        log.info(f"TikTok MLM Analysis: {json.dumps(tiktok_mlm_analysis, indent=2)}")
        # Analyze the Instagram post for MLM characteristics
        log.info(f"Instagram MLM Analysis: {json.dumps(instagram_mlm_analysis, indent=2)}")
        log.success("Successfully analyzed data.")
    except Exception as e:
        log.exception("An error occurred during execution.")