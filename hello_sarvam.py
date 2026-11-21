"""One Sarvam chat call. Run: .venv/bin/python hello_sarvam.py"""
import os

from sarvamai import SarvamAI

import engine.sarvam  # noqa: F401  ponytail: reuses its .env loader, no python-dotenv

client = SarvamAI(api_subscription_key=os.environ["SARVAM_API_KEY"])
r = client.chat.completions(
    model="sarvam-105b-conversations",
    messages=[{"role": "user", "content": "Say hello in Hindi in one short sentence."}],
)
print(r.choices[0].message.content)
