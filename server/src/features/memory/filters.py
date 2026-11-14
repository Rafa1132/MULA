"""What may enter memory: well-formed, not secret, not someone else's personal data."""
import re
import unicodedata

MIN_LENGTH = 3
MAX_LENGTH = 500
# Credentials and keys. Matched case-insensitively against the whole fact.
SECRET_PATTERNS = [
    re.compile(r"\b(?:api[_ -]?key|secret|token|password|passwd|kata sandi|pin)\b\s*[:=]\s*\S", re.IGNORECASE),
    re.compile(r"\bbearer\s+[a-z0-9._-]{16,}", re.IGNORECASE),
    re.compile(r"\b(?:sk|pk|rk)[-_](?:live|test|ant|proj)?[-_]?[a-z0-9]{16,}", re.IGNORECASE),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}"),
]
DIGIT_RUN = re.compile(r"(?<![\w-])(?:\d[ -]?){13,19}(?![\w-])")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE = re.compile(r"(?<!\d)(?:\+?\d[\d\s().-]{7,}\d)(?!\d)")
# Contact details next to these words describe a person other than the business.
THIRD_PARTY = re.compile(r"\b(?:customer|customers|client|pelanggan|konsumen|employee|employees|karyawan|pegawai|staff|driver|kurir|friend|teman|wife|husband|istri|suami|child|anak|mother|father|ibu|ayah|neighbour|neighbor|tetangga)\b", re.IGNORECASE)


class MemoryRefused(ValueError):
    """The fact must not be stored; the message is safe to show the owner and the model."""


def clean(fact):
    """Collapse whitespace and refuse control characters or out-of-range lengths."""
    if not isinstance(fact, str):
        raise MemoryRefused("A memory must be text.")
    text = " ".join(fact.split())
    for character in text:
        if unicodedata.category(character) in {"Cc", "Cf", "Cs", "Co", "Cn"}:
            raise MemoryRefused("A memory must be readable text without control characters.")
    if len(text) < MIN_LENGTH:
        raise MemoryRefused(f"A memory needs at least {MIN_LENGTH} characters.")
    if len(text) > MAX_LENGTH:
        raise MemoryRefused(f"A memory can hold at most {MAX_LENGTH} characters. Keep one fact per memory.")
    return text


def luhn_valid(digits):
    total = 0
    for position, digit in enumerate(reversed(digits)):
        value = int(digit)
        if position % 2 == 1:
            value *= 2
            if value > 9:
                value -= 9
        total += value
    return total % 10 == 0


def sensitive_reason(fact):
    """Why the fact must not be stored, or None when it may be."""
    for pattern in SECRET_PATTERNS:
        if pattern.search(fact):
            return "Credentials, keys and passwords are never saved to memory."
    for match in DIGIT_RUN.finditer(fact):
        digits = re.sub(r"\D", "", match.group())
        if len(digits) == 16 or luhn_valid(digits):
            # 16 digits is an Indonesian NIK; a Luhn-valid run is a payment card.
            return "Card numbers and national identity numbers are never saved to memory."
    if (EMAIL.search(fact) or PHONE.search(fact)) and THIRD_PARTY.search(fact):
        return "Other people's contact details are not saved to memory. The business's own details are fine."
    return None


def check(fact):
    """The cleaned fact, or MemoryRefused with the reason."""
    text = clean(fact)
    reason = sensitive_reason(text)
    if reason is not None:
        raise MemoryRefused(reason)
    return text


def normalize(fact):
    """Comparison form: lowercase, accents and punctuation removed, single spaces."""
    text = unicodedata.normalize("NFKD", fact)
    text = "".join(character for character in text if not unicodedata.combining(character))
    text = re.sub(r"[^\w\s]", " ", text.lower())
    return " ".join(text.split())


def tokens(normalized):
    return set(normalized.split())


def similarity(left, right):
    """Jaccard similarity of two normalized facts' word sets."""
    first = tokens(left)
    second = tokens(right)
    if not first or not second:
        return 0.0
    return len(first & second) / len(first | second)


DUPLICATE_THRESHOLD = 0.8
RELATED_THRESHOLD = 0.5
