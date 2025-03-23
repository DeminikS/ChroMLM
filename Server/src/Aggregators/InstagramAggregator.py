import asyncio
from loguru import logger as log
from src.Instagram.PostScraperINSTAGRAM import run as ig_post_run
from src.Instagram.ProfileScraperINSTAGRAM import run as ig_profile_run

MAX_RETRIES = 5


async def aggregate_data(post_url: str):
    log.info("Running Instagram data aggregator.")
    # Step 1: Fetch post data with retry logic
    post_data = None
    for attempt in range(MAX_RETRIES):
        post_data = await ig_post_run(post_url)
        if post_data:
            break
        print(f"Retry {attempt + 1} for fetching post data...")

    if not post_data:
        print("Failed to fetch post data after retries.")
        return

    # Extract the 'pk' for profile scraping
    pk = post_data.get("pk")
    if not pk:
        print("Failed to extract pk from post data.")
        return

    # Step 2: Fetch profile data using 'pk' with retry logic
    profile_data = None
    for attempt in range(MAX_RETRIES):
        profile_data = await ig_profile_run(pk)
        if profile_data:
            break
        print(f"Retry {attempt + 1} for fetching profile data...")

    if not profile_data:
        print("Failed to fetch profile data after retries.")
        return

    # Combine all data into one dictionary
    aggregated_data = {
        "profile_data": profile_data,
        "post_data": post_data
    }

    # Print the aggregated data
    log.success("Successfully aggregated scraped Instagram data.")
    return aggregated_data

if __name__ == "__main__":
    instagram_url = "https://www.instagram.com/p/C0SeC8oCT1L/?img_index=1"
    asyncio.run(aggregate_data(instagram_url))