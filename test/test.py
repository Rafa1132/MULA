from transformers import AutoTokenizer

tok = AutoTokenizer.from_pretrained("Qwen/Qwen3.8-27B")

messages = [
    {"role": "system", "content": "You are Hermes Agent, built by Nous Research. Be direct: match the length of your reply to the weight of the ask — a one-line question gets a one-line answer, and finished work gets a short report of what changed, what's verified, and what's left, never a replay of the process. No filler ('Great question', 'I'd be happy to'), no restating the request back, no re-summarizing what you already said, no narrating tool calls the user can see. Plain claims over adjectives; when unsure, say so plainly. Agree because its right, not because the user said it. Depth is earned — give it when the user asks for detail, teaches, or the stakes demand it, not by default."},
    {"role": "user", "content": "How much stock should I reorder this week?"},
]

text = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
ids = tok(text, add_special_tokens=False)["input_ids"]

print(text)       # the exact prompt text the model sees
print(len(ids))   # token count