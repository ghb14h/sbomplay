# Single Repository Visibility Fix

## Problem
Single repository analyses were being saved to IndexedDB but were **not visible in any of the interface pages** (stats.html, authors.html). Only organization analyses were being displayed.

## Root Cause
Both `stats.html` and `authors.html` were only loading organization data using `getOrganizations()` and `getCombinedData()`, which completely ignored single repository analyses stored in the `singleRepoAnalyses` object store.

## Solution

### 1. Updated `stats.html`
**Changes Made:**
- Modified `loadDashboardData()` to check for both organizations AND single repositories
- Replaced `getCombinedData()` with `getCombinedAggregatedData()` which includes both:
  - Organization analyses
  - Single repository analyses
- Updated the "no data" check to show data when either organizations or single repos exist

**Lines Changed:** 220-256

**Key Code:**
```javascript
// Check if we have any data (organizations OR single repos)
const organizations = await this.storageManager.getOrganizations();
const singleRepos = await this.storageManager.getAllSingleRepoAnalyses();
const hasData = organizations.length > 0 || singleRepos.length > 0;

// Load aggregated data (includes both orgs and single repos)
const aggregatedData = await this.storageManager.getCombinedAggregatedData();
```

### 2. Updated `authors.html`
**Changes Made:**
- Modified `displayOrganizationsOverview()` to load both organizations and single repositories
- Updated page header to show counts of both types of analyses
- Added a new table section specifically for single repositories
- Implemented `loadSingleRepoData()` function to view author data for single repos
- Implemented `removeSingleRepoData()` function to delete single repo analyses
- Updated the "no data" check to consider both sources

**Lines Changed:** 207-514

**Key Features Added:**
1. **Dual Data Source Loading:**
   ```javascript
   const organizations = await window.storageManager.getOrganizations();
   const singleRepos = await window.storageManager.getAllSingleRepoAnalyses();
   ```

2. **Single Repository Table:**
   - Shows repository name (owner/name format)
   - Displays dependency count
   - Last updated timestamp
   - "View Authors" button
   - "Remove" button

3. **Handler Functions:**
   - `window.loadSingleRepoData(owner, name)` - Loads and displays author analysis for a single repo
   - `window.removeSingleRepoData(owner, name)` - Deletes single repo data from IndexedDB

## Testing

You can verify the fix using the diagnostic tool:

1. Navigate to `http://localhost:8080/db-check.html`
2. Click "Check Database"
3. Verify that single repositories show up with their data

Then test the visibility:

1. Go to `http://localhost:8080/stats.html`
   - Should now show stats that include single repository data
   
2. Go to `http://localhost:8080/authors.html`
   - Should show a "Single Repositories" section listing all analyzed single repos
   - Click "View Authors" on any single repo to see its author analysis

## Related Files
- `/Users/glt5/WORK/github.com/ghb14h/sbomplay/stats.html` - Updated dashboard loading
- `/Users/glt5/WORK/github.com/ghb14h/sbomplay/authors.html` - Added single repo support
- `/Users/glt5/WORK/github.com/ghb14h/sbomplay/js/storage-manager.js` - Already had `getCombinedAggregatedData()` and `getAllSingleRepoAnalyses()`
- `/Users/glt5/WORK/github.com/ghb14h/sbomplay/js/singlerepo-wrapper.js` - Already fixed progress bar visibility

## Status
✅ **FIXED** - Single repository data is now visible across all pages that were previously only showing organization data.

