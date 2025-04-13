import asyncio
import json
import random
from contextlib import asynccontextmanager
from typing import Dict, List, AsyncGenerator
from urllib.parse import quote

import asyncio_throttle
import httpx
from loguru import logger as log
from tenacity import retry, stop_after_attempt, wait_fixed

INSTAGRAM_DOCUMENT_ID = "8845758582119845"  

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
async def scrape_post(url_or_shortcode: str) -> Dict:
    log.info("Scraping post data: {}", url_or_shortcode)
    """Scrape single Instagram post data"""
    if "http" in url_or_shortcode:
        shortcode = url_or_shortcode.split("/p/")[-1].split("/")[0]
    else:
        shortcode = url_or_shortcode

    log.debug("Extracted shortcode: {}", shortcode)
    variables = quote(json.dumps({
        'shortcode': shortcode, 'fetch_tagged_user_count': None,
        'hoisted_comment_id': None, 'hoisted_reply_id': None
    }, separators=(',', ':')))
    body = f"variables={variables}&doc_id={INSTAGRAM_DOCUMENT_ID}"
    url = "https://www.instagram.com/graphql/query"

    log.debug("Request body: {}", body)
    log.debug("Request URL: {}", url)

    async with get_http_client() as client:
        try:
            result = await client.post(url=url, data=body)
            log.debug("Received response with status code: {}", result.status_code)
            result.raise_for_status()
            data = json.loads(result.content)
            log.debug("Raw response data received")
            data = await parse_post(data.get("data", {}).get("xdt_shortcode_media", {}))
            log.info("Successfully scraped post data for: {}", url_or_shortcode)
            return data
        except httpx.RequestError as e:
            log.error("Network error while fetching post data for {}: {}", url_or_shortcode, str(e))
        except httpx.HTTPStatusError as e:
            log.error("HTTP error while fetching post data for {}: HTTP {}", url_or_shortcode, e.response.status_code)
        except json.JSONDecodeError as e:
            log.error("Failed to decode JSON response for {}: {}", url_or_shortcode, str(e))
        log.info("Successfully scraped post and comment data.")
    return {}


async def parse_post(data: Dict) -> Dict:
    log.info("Parsing post and comment data from response.")
    if not data:
        log.warning("Post data is empty or not available.")
        return {}
    log.debug("Parsing post data for shortcode: {}", data.get("shortcode", "unknown"))
    result = {
        "username": data.get("owner", {}).get("username"),
        "pk": data.get("owner", {}).get("id"),
        "id": data.get("id"),
        "shortcode": data.get("shortcode"),
        "dimensions": data.get("dimensions"),
        "src": data.get("display_url"),
        "thumbnail_src": data.get("thumbnail_src"),
        "media_preview": data.get("media_preview"),
        "video_url": data.get("video_url"),
        "views": data.get("video_view_count"),
        "likes": data.get("edge_media_preview_like", {}).get("count"),
        "location": data.get("location", {}).get("name") if data.get("location") else None,
        "taken_at": data.get("taken_at_timestamp"),
        "related": await parse_related_media(data),
        "type": data.get("product_type"),
        "video_duration": data.get("video_duration"),
        "music": data.get("clips_music_attribution_info"),
        "is_video": data.get("is_video"),
        "tagged_users": await parse_tagged_users(data),
        "captions": await parse_captions(data),
        "related_profiles": await parse_related_profiles(data),
        "comments": await parse_comments(data)
    }
    log.info("Successfully parsed post and comment data.")
    return result


async def parse_related_media(data: Dict) -> List[str]:
    log.debug("Parsing related media")
    related_media = [edge.get("node", {}).get("shortcode") for edge in
                     data.get("edge_web_media_to_related_media", {}).get("edges", [])]
    log.debug("Parsed {} related media items", len(related_media))
    return related_media


async def parse_tagged_users(data: Dict) -> List[str]:
    log.debug("Parsing tagged users")
    tagged_users = [edge.get("node", {}).get("user", {}).get("username") for edge in
                    data.get("edge_media_to_tagged_user", {}).get("edges", [])]
    log.debug("Parsed {} tagged users", len(tagged_users))
    return tagged_users


async def parse_captions(data: Dict) -> List[str]:
    log.debug("Parsing captions")
    captions = [edge.get("node", {}).get("text") for edge in data.get("edge_media_to_caption", {}).get("edges", [])]
    log.debug("Parsed {} captions", len(captions))
    return captions


async def parse_related_profiles(data: Dict) -> List[str]:
    log.debug("Parsing related profiles")
    related_profiles = [edge.get("node", {}).get("username") for edge in
                        data.get("edge_related_profiles", {}).get("edges", [])]
    log.debug("Parsed {} related profiles", len(related_profiles))
    return related_profiles


async def parse_comments(data: Dict) -> List[Dict]:
    log.debug("Parsing comments")
    comments = []
    for edge in data.get("edge_media_to_parent_comment", {}).get("edges", []):
        node = edge.get("node", {})
        comment = {
            "id": node.get("id"),
            "text": node.get("text"),
            "created_at": node.get("created_at"),
            "owner": node.get("owner", {}).get("username"),
            "owner_verified": node.get("owner", {}).get("is_verified"),
            "viewer_has_liked": node.get("viewer_has_liked"),
            "likes": node.get("edge_liked_by", {}).get("count"),
            "replies": await parse_replies(node)
        }
        comments.append(comment)
    log.debug("Parsed {} comments", len(comments))
    return comments


async def parse_replies(node: Dict) -> List[Dict]:
    log.debug("Parsing replies for comment id: {}", node.get("id"))
    replies = [
        {
            "id": reply_node.get("id"),
            "text": reply_node.get("text"),
            "created_at": reply_node.get("created_at"),
            "owner": reply_node.get("owner", {}).get("username"),
            "owner_verified": reply_node.get("owner", {}).get("is_verified"),
            "viewer_has_liked": reply_node.get("viewer_has_liked"),
            "likes": reply_node.get("edge_liked_by", {}).get("count")
        }
        for edge in node.get("edge_threaded_comments", {}).get("edges", [])
        if (reply_node := edge.get("node", {}))
    ]
    log.debug("Parsed {} replies for comment id: {}", len(replies), node.get("id"))
    return replies


async def run(url):
    log.info("Running Instagram post and comment scraper.")
    throttle = asyncio_throttle.Throttler(rate_limit=5, period=1)  
    async with throttle:
        post_data = await scrape_post(url)
    log.success("Successfully scraped post and comment data from Instagram")
    return post_data