import asyncio
import json
import random
from contextlib import asynccontextmanager
from typing import Dict, AsyncGenerator
from urllib.parse import quote

import asyncio_throttle
import httpx
from loguru import logger as log
from tenacity import retry, stop_after_attempt, wait_fixed

# Constants for GraphQL document IDs
INSTAGRAM_PROFILE_DOCUMENT_ID = "9539110062771438"  # Document ID for profile requests from Instagram

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
]

HEADERS = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/x-www-form-urlencoded",
}


@asynccontextmanager
async def get_http_client() -> AsyncGenerator[httpx.AsyncClient, None]:
    headers = HEADERS.copy()
    headers["user-agent"] = random.choice(USER_AGENTS)
    log.debug("Using headers: {}", headers)
    async with httpx.AsyncClient(headers=headers, timeout=httpx.Timeout(10.0)) as client:
        yield client


@retry(stop=stop_after_attempt(3), wait=wait_fixed(2))
async def scrape_profile(username: str) -> Dict:
    log.info("Scraping profile data for {}", username)
    """Scrape Instagram profile data"""
    variables = quote(json.dumps({
        'id': username,
        'render_surface': 'PROFILE'
    }, separators=(',', ':')))
    body = f"variables={variables}&doc_id={INSTAGRAM_PROFILE_DOCUMENT_ID}"
    url = "https://www.instagram.com/graphql/query"

    log.debug("Request body: {}", body)
    log.debug("Request URL: {}", url)

    async with get_http_client() as client:
        try:
            result = await client.post(url=url, data=body)
            log.debug("Received response with status code: {}", result.status_code)
            result.raise_for_status()
            data = json.loads(result.content)
            log.debug("Raw response data: {}", data)
            user_data = data.get("data")
            if not user_data:
                log.error("Profile data is missing in the response.")
                return {}
            data = await parse_profile(user_data.get("user", {}))
            log.success("Scraped profile data for {}", username)
            return data
        except httpx.RequestError as e:
            log.error("Network error while fetching profile data for %s: %s", username, str(e))
        except httpx.HTTPStatusError as e:
            log.error("HTTP error while fetching profile data for %s: HTTP %s", username, e.response.status_code)
        except json.JSONDecodeError as e:
            log.error("Failed to decode JSON response for %s: %s", username, str(e))
        log.info("Successfully scraped profile data.")
    return {}


async def parse_profile(data: Dict) -> Dict:
    log.info("Parsing profile data from response.")
    if not data:
        log.error("Profile data is empty or not available.")
        return {}
    log.debug("Parsing profile data for {}", data.get("username", "unknown"))
    result = {
        "username": data.get("username"),
        "full_name": data.get("full_name"),
        "profile_pic_url": data.get("profile_pic_url"),
        "bio": data.get("biography"),
        "follower_count": data.get("follower_count"),
        "following_count": data.get("following_count"),
        "media_count": data.get("media_count"),
        "is_private": data.get("is_private"),
        "is_verified": data.get("is_verified"),
        "external_url": data.get("external_url"),
        "category": data.get("category"),
    }
    log.debug("Parsed profile data: {}", result)
    log.info("Successfully parsed profile data.")
    return result


async def run(pk):
    log.info("Running Instagram profile scraper.")
    throttle = asyncio_throttle.Throttler(rate_limit=5, period=1)  # Throttle requests to avoid getting blocked
    async with throttle:
        log.info("Starting profile scraping")
        profile_data = await scrape_profile(pk)
    log.success("Successfully scraped post and comment data from Instagram")
    return profile_data


if __name__ == "__main__":
    log.info("Running main function")
    asyncio.run(run("1021317618"))