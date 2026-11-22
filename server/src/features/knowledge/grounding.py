"""A deterministic check that an agent's reply doesn't invent numbers.

Prices, stock counts, dates and discounts are where an invented answer does the most harm, and they
are easy to spot: digits. A reply may only contain a number that appears in the knowledge base or in
the customer's own messages. Anything else is "unsupported", and the reply is replaced by a handoff
(features/support). This backs up the agent's instructions; it doesn't replace them, and it can't
catch invented words.
"""
import re

# A run of digits, allowing thousands separators and decimals: 15.000, 1,250.50, 3.5, 2026.
NUMBER = re.compile(r"\d+(?:[.,]\d+)*")


def normalize(number: str) -> str:
    """Digits only, so 15.000, 15,000 and 15000 compare equal."""
    return re.sub(r"\D", "", number)


def numbers_in(text: str) -> set[str]:
    return {normalize(match) for match in NUMBER.findall(text)}


def unsupported_numbers(reply: str, *sources: str) -> set[str]:
    """Numbers in `reply` that none of `sources` contains. Single digits are allowed: "1 moment",
    "2 options" and list numbering are not facts worth blocking a reply for."""
    known = set()
    for source in sources:
        known |= numbers_in(source)
    return {number for number in numbers_in(reply) if len(number) > 1 and number not in known}
