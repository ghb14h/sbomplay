# GitHub API Rate Limit UI Improvements

## Overview
Enhanced the user experience when GitHub API rate limits are hit by adding prominent visual indicators across all pages.

## Problem
Previously, when users hit the GitHub API rate limit:
- **Single Repository Page**: No UI indicator at all - only console messages
- **Organization Page**: Only a message in the progress section (easy to miss)
- Users were left confused about why their analysis stopped working

## Solution
Added a **prominent fixed banner** at the top of the page that appears automatically when rate limits are exceeded.

## Features

### 1. **Prominent Rate Limit Banner**
- Fixed position at the top-center of the page
- High z-index (9999) to ensure visibility
- Bootstrap alert styling with warning colors
- Dismissible (users can close it if needed)

### 2. **Real-Time Countdown**
- Shows exact reset time in local timezone
- Live countdown timer updating every second
- Human-readable format: "X minutes Y seconds"

### 3. **User Guidance**
- Clear explanation of what happened
- Information about automatic continuation
- Helpful tip about using GitHub tokens to increase limits
  - Without token: 60 requests/hour
  - With token: 5,000 requests/hour
- Direct links to token configuration

### 4. **UI State Management**
- Analyze button is automatically disabled during rate limit
- Re-enabled when limit resets
- Progress section also shows rate limit status

## Implementation Details

### Files Modified

#### 1. `js/singlerepo-wrapper.js`
Added rate limit event listeners and UI methods:
- `setupRateLimitListeners()` - Listens for rate limit events from GitHub client
- `showRateLimitWaiting(waitTime, resetTime)` - Creates/updates the banner
- `hideRateLimitWaiting()` - Removes the banner when limit resets
- `startRateLimitCountdown(waitTime)` - Updates countdown every second
- `formatTime(seconds)` - Formats seconds to human-readable string

#### 2. `js/app.js`
Enhanced existing rate limit handlers:
- Updated `showRateLimitWaiting()` to create prominent banner
- Updated `hideRateLimitWaiting()` to remove banner
- Updated `startRateLimitCountdown()` to update both banner and progress section
- Updated `formatTime()` to use human-readable format instead of MM:SS

### Event Flow

```
1. GitHub API returns 403 with X-RateLimit-Remaining: 0
   ↓
2. GitHubClient detects rate limit and dispatches 'rateLimitExceeded' event
   ↓
3. Event listener in SingleRepoAnalyzer/App calls showRateLimitWaiting()
   ↓
4. Banner appears at top of page with countdown
   ↓
5. Analyze button is disabled
   ↓
6. GitHub client waits for reset time
   ↓
7. 'rateLimitReset' event is dispatched
   ↓
8. hideRateLimitWaiting() removes banner and re-enables button
   ↓
9. Analysis continues automatically
```

## User Experience

### Before Rate Limit Hit
- User performs analysis normally
- No indication of remaining requests

### When Rate Limit Hit
1. **Prominent Banner Appears** at top of page:
   ```
   ⏰ GitHub API Rate Limit Exceeded
   
   The GitHub API rate limit has been reached. The analysis will
   automatically continue when the limit resets.
   
   Reset Time: 3:45:22 PM
   Time Remaining: 42 minutes 18 seconds
   
   💡 Tip: Add a GitHub Personal Access Token to increase your rate
   limit from 60 to 5,000 requests/hour.
   ```

2. **Analyze Button Disabled** - Prevents multiple failed attempts
3. **Progress Section Updated** - Shows waiting status
4. **Live Countdown** - Updates every second

### When Rate Limit Resets
1. Banner is automatically removed
2. Success toast notification appears
3. Analyze button is re-enabled
4. Analysis continues automatically (for in-progress analyses)

## Benefits

1. **Clear Communication**: Users immediately understand what's happening
2. **No Confusion**: Prominent visual indicator can't be missed
3. **Actionable Information**: Users learn they can add a token to avoid limits
4. **Automatic Recovery**: No manual intervention needed
5. **Professional UX**: Polished, informative error handling

## Testing

To test the rate limit banner:

1. **Without Token** (easiest way to hit limits):
   - Clear any GitHub token from settings
   - Run multiple analyses in quick succession
   - You'll hit the 60 requests/hour limit quickly

2. **With Browser DevTools** (manual trigger):
   ```javascript
   // In browser console
   const event = new CustomEvent('rateLimitExceeded', {
     detail: {
       waitTime: 120,  // 2 minutes
       resetTime: Math.floor(Date.now() / 1000) + 120,
       resetDate: new Date(Date.now() + 120000)
     }
   });
   window.singleRepoAnalyzer.githubClient.eventTarget.dispatchEvent(event);
   window.singleRepoAnalyzer.showRateLimitWaiting(120, Math.floor(Date.now() / 1000) + 120);
   ```

3. **Verify**:
   - Banner appears at top of page
   - Countdown updates every second
   - Button is disabled
   - Clicking X closes the banner

## Future Enhancements

1. **Proactive Rate Limit Display**
   - Show remaining requests in header
   - Warn when approaching limit (< 10 requests)
   - Visual indicator of rate limit status

2. **Smart Throttling**
   - Automatically slow down requests when approaching limit
   - Prioritize critical requests

3. **Rate Limit History**
   - Track when limits were hit
   - Show statistics in settings

4. **Token Validation**
   - Check token validity before analysis
   - Show current rate limit status with token

## Notes

- The GitHub API rate limit resets every hour
- Without token: 60 requests/hour
- With token: 5,000 requests/hour (core API), 1,000/hour (search API)
- Rate limits are per-user or per-token, not per-application
- The implementation handles 403 responses with `X-RateLimit-Remaining: 0`

## Related Files

- `js/github-client.js` - GitHub API client with rate limit detection
- `js/singlerepo-wrapper.js` - Single repo analyzer with UI handlers
- `js/app.js` - Organization analyzer with UI handlers
- `settings.html` - Where users can add GitHub tokens

