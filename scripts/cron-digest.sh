#!/bin/bash
# Follow Builders — Cron digest wrapper
# Runs prepare-digest.js, then uses Claude CLI to remix + translate,
# then saves and delivers the result.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="/opt/homebrew/bin/node"
CLAUDE="/Users/wukuai/.local/bin/claude"
CONFIG="$HOME/.follow-builders/config.json"
PROMPT_DIR="$SCRIPT_DIR/../prompts"
USER_PROMPT_DIR="$HOME/.follow-builders/prompts"

# Read language from config
LANG_PREF=$(python3 -c "import json; print(json.load(open('$CONFIG')).get('language','en'))" 2>/dev/null || echo "en")

# Use user prompts if they exist, otherwise use defaults
get_prompt() {
  if [ -f "$USER_PROMPT_DIR/$1" ]; then
    cat "$USER_PROMPT_DIR/$1"
  else
    cat "$PROMPT_DIR/$1"
  fi
}

DIGEST_INTRO=$(get_prompt "digest-intro.md")
SUMMARIZE_TWEETS=$(get_prompt "summarize-tweets.md")
SUMMARIZE_PODCAST=$(get_prompt "summarize-podcast.md")
SUMMARIZE_BLOGS=$(get_prompt "summarize-blogs.md")
TRANSLATE=$(get_prompt "translate.md")

# Step 1: Fetch raw data
RAW_JSON=$($NODE "$SCRIPT_DIR/prepare-digest.js" 2>/dev/null)

if [ -z "$RAW_JSON" ]; then
  echo "No data from prepare-digest.js" >&2
  exit 1
fi

# Step 2: Build the prompt for Claude
if [ "$LANG_PREF" = "zh" ]; then
  LANG_INSTRUCTION="Output the ENTIRE digest in Chinese. Follow the translation prompt below.

$TRANSLATE"
elif [ "$LANG_PREF" = "bilingual" ]; then
  LANG_INSTRUCTION="Output the digest in BILINGUAL mode (English + Chinese interleaved paragraph by paragraph). Follow the translation prompt below.

$TRANSLATE"
else
  LANG_INSTRUCTION="Output the entire digest in English only."
fi

PROMPT="You are an AI content curator. Remix the following raw JSON feed into a polished AI Builders Digest.

=== DIGEST FORMAT ===
$DIGEST_INTRO

=== HOW TO SUMMARIZE TWEETS ===
$SUMMARIZE_TWEETS

=== HOW TO SUMMARIZE PODCASTS ===
$SUMMARIZE_PODCAST

=== HOW TO SUMMARIZE BLOGS ===
$SUMMARIZE_BLOGS

=== LANGUAGE ===
$LANG_INSTRUCTION

=== RAW FEED DATA (JSON) ===
$RAW_JSON

Now generate the digest. Output ONLY the digest text, no preamble or explanation."

# Step 3: Run Claude to remix
DIGEST=$(echo "$PROMPT" | $CLAUDE -p --model sonnet 2>/dev/null)

if [ -z "$DIGEST" ]; then
  echo "Claude returned empty output" >&2
  exit 1
fi

# Step 4: Save raw JSON
echo "$RAW_JSON" > /tmp/fb-raw.json
$NODE "$SCRIPT_DIR/save-digest.js" --file /tmp/fb-raw.json 2>/dev/null

# Step 5: Save remixed digest (overwrite the raw-formatted one)
echo "$DIGEST" > /tmp/fb-digest.txt
TODAY=$(python3 -c "
import json, datetime
cfg = json.load(open('$CONFIG'))
tz = cfg.get('timezone','UTC')
from zoneinfo import ZoneInfo
print(datetime.datetime.now(ZoneInfo(tz)).strftime('%Y-%m-%d'))
" 2>/dev/null || date +%Y-%m-%d)

DIGESTS_DIR="$HOME/.follow-builders/digests"
mkdir -p "$DIGESTS_DIR"
python3 -c "
import json, sys
content = open('/tmp/fb-digest.txt').read().strip()
digest = {
    'date': '$TODAY',
    'generatedAt': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
    'language': '$LANG_PREF',
    'content': content
}
with open('$DIGESTS_DIR/$TODAY.json', 'w') as f:
    json.dump(digest, f, indent=2, ensure_ascii=False)
"

# Step 6: Deliver
$NODE "$SCRIPT_DIR/deliver.js" --file /tmp/fb-digest.txt 2>/dev/null

# Cleanup
rm -f /tmp/fb-raw.json /tmp/fb-digest.txt
