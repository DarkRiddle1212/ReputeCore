# AI Summary Setup Guide

## Overview

Your platform now includes AI-powered wallet analysis summaries using Groq's free API with Llama 3.1 70B model.

## Features Added

✅ Natural language summaries of wallet analysis  
✅ Automatic categorization of risks and positive signals  
✅ Smart, context-aware explanations  
✅ Completely FREE with generous rate limits  
✅ Fast responses (< 1 second)  
✅ Graceful fallback if AI is unavailable

## Setup Instructions

### Step 1: Get Your Free Groq API Key

1. Go to https://console.groq.com
2. Click "Sign Up" (no credit card required)
3. Verify your email
4. Go to "API Keys" section
5. Click "Create API Key"
6. Copy your API key

### Step 2: Add API Key to Your Project

Open your `.env` file and replace the placeholder:

```env
# AI Services
GROQ_API_KEY=your_actual_groq_api_key_here
```

### Step 3: Restart Your Development Server

```bash
# Stop your current server (Ctrl+C)
# Then restart:
npm run dev
```

### Step 4: Test It Out

1. Go to your app: http://localhost:3000
2. Analyze any wallet address
3. You should see an "AI Analysis" section with a natural language summary!

## How It Works

### Before (Without AI):

```
Reason: Deterministic score based on on-chain analysis
```

### After (With AI):

```
AI Analysis:
This wallet shows concerning patterns with a trust score of 35/100.
The developer sold 85% of tokens immediately after launch with very
low initial liquidity of $500, suggesting a potential rug pull.
The wallet is also very new (less than 7 days old) with minimal
transaction history, raising additional red flags.
```

## What Gets Analyzed

The AI receives:

- Trust score and risk level
- Wallet age and activity
- Critical risks found
- Warnings identified
- Positive signals detected
- Token launch information
- Confidence level

## Rate Limits (FREE Tier)

- **30 requests per minute**
- **6,000 tokens per minute**
- **No daily limit**

This is more than enough for most projects!

## Cost

**$0.00** - Completely FREE forever!

## Troubleshooting

### AI Summary Not Showing?

1. **Check your API key:**

   ```bash
   # Make sure it's set in .env
   cat .env | grep GROQ_API_KEY
   ```

2. **Check the console:**
   - Look for `[AISummaryService] Groq AI enabled` in your server logs
   - If you see `Groq API key not found`, the key isn't loaded

3. **Restart your server:**
   - Changes to `.env` require a restart
   - Stop (Ctrl+C) and run `npm run dev` again

4. **Check for errors:**
   - Look for `[AISummaryService] Failed to generate summary` in logs
   - This means the API call failed (check your API key)

### Still Not Working?

The app will work fine without AI - it just won't show the AI summary section. The regular analysis still works perfectly!

## Technical Details

### Files Modified:

- ✅ `lib/services/AISummaryService.ts` - AI service (NEW)
- ✅ `app/api/analyze/route.ts` - API integration
- ✅ `components/ScoreCard.tsx` - UI display
- ✅ `.env` - API key configuration
- ✅ `package.json` - Added groq-sdk dependency

### Model Used:

- **Model:** `llama-3.1-70b-versatile`
- **Temperature:** 0.3 (consistent, factual)
- **Max Tokens:** 250 (2-3 paragraph summary)
- **Provider:** Groq (fastest free LLM API)

### Fallback Behavior:

- If Groq API key is missing → AI disabled, app works normally
- If AI generation fails → Shows regular reason text
- If rate limit hit → Shows regular reason text
- **Your app never breaks due to AI issues!**

## Next Steps

Want to customize the AI summaries?

Edit `lib/services/AISummaryService.ts`:

- Change the `temperature` (0.1 = more consistent, 0.7 = more creative)
- Modify the `max_tokens` (longer/shorter summaries)
- Update the system prompt for different tone
- Switch models if needed

## Support

- Groq Documentation: https://console.groq.com/docs
- Groq Discord: https://discord.gg/groq
- Model Info: https://console.groq.com/docs/models

---

**Enjoy your AI-powered wallet analysis! 🚀**
