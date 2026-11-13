
from pathlib import Path
from playwright.sync_api import sync_playwright

SELLER_URL = "https://seller-id.tokopedia.com/"
USER_DATA_DIR = Path("./tokopedia_session")

def main():
    with sync_playwright() as p:
        # Launch persistent browser session
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(USER_DATA_DIR),
            headless=False,
            viewport={"width": 1440, "height": 900},
            args=["--start-maximized"]
        )

        page = context.pages[0] if context.pages else context.new_page()

        # Open Tokopedia Seller Center
        page.goto(
            SELLER_URL,
            wait_until="domcontentloaded",
            timeout=60000
        )

        print("Tokopedia Seller Center opened.")
        print("Please complete login in the browser if required.")

        # Wait until you finish login manually
        input("Press ENTER after you have successfully logged in...")

        print("Current URL:", page.url)
        print("Session saved in:", USER_DATA_DIR)

        # Keep browser open until manually closed
        input("Press ENTER to close browser...")

        context.close()

if __name__ == "__main__":
    main()
