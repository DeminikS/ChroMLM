import json
import sys
from openai import OpenAI
from src.DataStandardization.Standardizer import run as standard_data
from loguru import logger as log

client = OpenAI(base_url="http://localhost:1234/v1", api_key="lm-studio")

def load_standardized_data(file_path):
    log.info(f"Loading standardized data from {file_path}")
    with open(file_path, 'r', encoding='utf-8') as file:
        return json.load(file)

def classify_mlm_content(data):
    log.info("Classifying MLM content")
    profile = data.get("profile", {})
    post = data.get("post", {})
    comments = data.get("comments", [])

    input_message = (
        f"Profile Bio: {profile.get('bio')}, Follower Count: {profile.get('followerCount')}\n"
        f"Post Title: {post.get('title')}\n"
        f"Post Tags: {', '.join(post.get('tags')) if post.get('tags') else 'None'}\n"
        f"Comments: {[comment['comment'] for comment in comments]}"
    )

    model_identifier = "model-identifier"  
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

    result = response.choices[0].message.content
    try:
        if result.startswith("```json") and result.endswith("```"):
            result = result[7:-3].strip()
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
        log.info("Loading data for analysis.")
        data = await standard_data(url)
        analysis = classify_mlm_content(data)
        log.info(f"MLM Analysis: {json.dumps(analysis, indent=2)}")
        log.success("Successfully analyzed data.")
        return analysis
    except Exception as e:
        log.exception("An error occurred during execution.")
        return {"error": str(e)}