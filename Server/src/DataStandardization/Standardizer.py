from typing import Any, Dict
from loguru import logger as log
from src.Aggregators.InstagramAggregator import aggregate_data as ig_aggregate_data


class DataStandardizer:
    @staticmethod
    def standardize_instagram_data(aggregated_data: Dict[str, Any]) -> Dict[str, Any]:
        profile = aggregated_data.get("profile_data", {})
        post = aggregated_data.get("post_data", {})

        comments = [
            {
                "user": comment.get("owner"),
                "comment": comment.get("text"),
                "replies": [
                    {
                        "user": reply.get("owner"),
                        "comment": reply.get("text")
                    }
                    for reply in comment.get("replies", [])
                ]
            }
            for comment in post.get("comments", [])
        ]

        captions = post.get("captions", [])
        hashtags = []
        for caption in captions:
            if caption:
                hashtags += [token.replace("@", "") for token in caption.split() if token.startswith("#")]

        return {
            "profile": {
                "username": profile.get("username"),
                "nickname": profile.get("full_name"),
                "bio": profile.get("bio", None),
                "verified": profile.get("is_verified"),
                "bioLinks": None if profile.get("external_url") == "" else profile.get("external_url", None),
                "followerCount": profile.get("follower_count"),
                "followingCount": profile.get("following_count")
            },
            "post": {
                "title": None if captions == [] or captions[0] == "" else captions[0],
                "likes": post.get("likes"),
                "tags": hashtags
            },
            "comments": comments
        }

    @staticmethod
    def standardize_data(platform: str, aggregated_data: Dict[str, Any]) -> Dict[str, Any]:
        platform_standardizers = {
            "instagram": DataStandardizer.standardize_instagram_data,
        }

        if platform in platform_standardizers:
            return platform_standardizers[platform](aggregated_data)
        else:
            raise ValueError("Unsupported platform")


def extract_platform_from_url(url: str) -> str:
    if "tiktok.com" in url:
        return "tiktok"
    elif "instagram.com" in url:
        return "instagram"
    else:
        raise ValueError("Unsupported platform")


async def get_standardized_data(post_link: str) -> Dict[str, Any]:
    platform = extract_platform_from_url(post_link)

    if platform == "instagram":
        aggregated_data = await ig_aggregate_data(post_link)
        if not aggregated_data:
            raise ValueError("Failed to fetch Instagram data")
        return DataStandardizer.standardize_data(platform, aggregated_data)


async def run(url):
    log.info("Running data standardizer.")
    data = await get_standardized_data(url)
    log.success("Successfully standardized scraped data.")
    return data

