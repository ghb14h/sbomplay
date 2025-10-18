# Testing Guide - SBOM Play

**Purpose:** Verify the complete 5-phase automatic analysis works correctly  
**Date:** October 17, 2025  
**Status:** Integration complete, ready for testing

---

## 🎯 What to Test

### Core Functionality: 5-Phase Automatic Analysis
All 5 phases should run automatically without any manual triggers.

---

## 🧪 Test Scenarios

### Test 1: Small Repository (Quick Test - 5 minutes)

**Objective:** Verify all 5 phases execute correctly

**Steps:**
1. Open `index.html` in your browser
2. (Optional) Enter GitHub token for better rate limits
3. Enter repository: `cyfinoid/keychecker`
4. Click "Start Analysis"
5. **Watch the progress bar:**
   - Should show: "1/5 Extracting SBOM data..."
   - Then: "2/5 Extracting transitive dependencies..."
   - Then: "3/5 Analyzing vulnerabilities..."
   - Then: "4/5 Analyzing license compliance..."
   - Then: "5/5 Analyzing package authors..."
   - Finally: "Analysis complete!" at 100%

**Expected Results:**
- ✅ Progress shows all 5 phases (1/5, 2/5, 3/5, 4/5, 5/5)
- ✅ No "4/4 Complete" message
- ✅ Analysis completes successfully
- ✅ Data appears on all pages:
  - stats.html - Shows dependency stats
  - deps.html - Shows dependencies
  - vuln.html - Shows vulnerabilities (or "No vulnerabilities found")
  - license-compliance.html - Shows license analysis
  - authors.html - Shows author analysis

**Pass Criteria:**
- Progress indicators show 1/5 through 5/5 (not 1/4 through 4/4)
- All phases complete without errors
- Data visible on all relevant pages

---

### Test 2: Small Organization (Medium Test - 15-30 minutes)

**Objective:** Verify workflow with multiple repositories

**Steps:**
1. Open `index.html` in your browser
2. **Recommended:** Enter GitHub token (otherwise you'll hit rate limits quickly)
3. Enter organization: `cyfinoid` (14 repositories)
4. Click "Start Analysis"
5. Monitor progress through all 5 phases
6. Wait for completion (may take 15-30 minutes depending on rate limits)

**Expected Results:**
- ✅ Phase 1: Processes all 14 repositories
- ✅ Phase 2: Extracts transitive dependencies
- ✅ Phase 3: Runs vulnerability scan automatically
- ✅ Phase 4: Runs license analysis automatically
- ✅ Phase 5: Runs author analysis automatically
- ✅ Final results show on all pages

**Pass Criteria:**
- All phases complete without manual intervention
- Progress bar shows 1/5 through 5/5
- vuln.html shows vulnerability data (not "No data, click button")
- license-compliance.html shows license data (not "No data, run analysis")
- authors.html shows author data (not "No author data available")

---

### Test 3: Large Organization (Long Test - 1-2 hours)

**Objective:** Verify scalability and rate limit handling

**Prerequisites:**
- ⚠️ **GitHub token required** (will hit rate limits without it)

**Steps:**
1. Open `index.html` in your browser
2. Enter GitHub token
3. Enter organization: `microsoft` or `facebook` (50+ repositories)
4. Click "Start Analysis"
5. Monitor progress
6. **If rate limit hit:**
   - Tool should show rate limit message
   - Progress should pause and resume automatically
   - Analysis should continue after reset

**Expected Results:**
- ✅ Handles large number of repositories
- ✅ All 5 phases complete (may take 1-2 hours)
- ✅ Rate limit handling works (if limit hit)
- ✅ Incremental saving works (data saved every 10 repos)
- ✅ Can view partial results before completion

**Pass Criteria:**
- Completes successfully (or handles rate limits gracefully)
- All 5 phases execute
- Data available across all pages after completion

---

## 🔍 What to Watch For

### Progress Indicators
✅ **Correct:**
```
1/5 Extracting SBOM data...
2/5 Extracting transitive dependencies...
3/5 Analyzing vulnerabilities...
4/5 Analyzing license compliance...
5/5 Analyzing package authors...
```

❌ **Incorrect (old behavior):**
```
1/4 Extracting SBOM data...
2/4 Extracting transitive dependencies...
3/4 Analyzing vulnerabilities...
4/4 Analyzing license compliance...
5/5 Analyzing package authors...  ← Inconsistent!
```

### Console Messages
Open browser console (F12) and watch for:
- ✅ Phase completion messages
- ✅ "Vulnerability Analysis Results:"
- ✅ "License Compliance Analysis Results:"
- ✅ "Author analysis complete: X unique authors found"
- ❌ Any errors or warnings

### Data Persistence
After analysis completes:
1. Check stats.html - Should show complete dashboard
2. Check deps.html - Should show all dependencies
3. Check vuln.html - Should show vulnerability results (not "No data" message)
4. Check license-compliance.html - Should show license results (not "No data" message)
5. Check authors.html - Should show author results (not "No data" message)
6. Refresh browser and verify data persists

---

## 📊 Verification Checklist

After running Test 1 or Test 2, verify:

### Progress Bar
- [ ] Shows "1/5" for Phase 1
- [ ] Shows "2/5" for Phase 2
- [ ] Shows "3/5" for Phase 3
- [ ] Shows "4/5" for Phase 4
- [ ] Shows "5/5" for Phase 5
- [ ] Never shows "1/4", "2/4", "3/4", or "4/4"
- [ ] Progress bar visible throughout analysis
- [ ] Progress reaches 100% at end

### Automatic Execution
- [ ] Phase 3 (vulnerabilities) runs automatically
- [ ] Phase 4 (licenses) runs automatically
- [ ] Phase 5 (authors) runs automatically
- [ ] No manual button clicks required
- [ ] No "Run Analysis" buttons needed

### Data Display
- [ ] stats.html shows complete data
- [ ] deps.html shows dependencies
- [ ] vuln.html shows vulnerability data (or "none found")
- [ ] license-compliance.html shows license data
- [ ] authors.html shows author data
- [ ] No "No data available" messages on pages

### Console
- [ ] No JavaScript errors
- [ ] Success messages for each phase
- [ ] No "not a function" errors
- [ ] No "undefined" errors

---

## 🐛 Common Issues

### Issue: "No dependencies found"
**Cause:** Repository doesn't have Dependency Graph enabled  
**Solution:** Enable Dependency Graph in repository settings

### Issue: "Rate limit exceeded"
**Cause:** Hit GitHub API rate limit (60/hour without token)  
**Solution:** Add GitHub Personal Access Token

### Issue: "Analysis stuck at X%"
**Cause:** Network timeout or API error  
**Solution:** Check console for errors, try again

### Issue: Pages show "No data"
**Cause:** Either analysis didn't complete or old cached pages  
**Solution:** 
1. Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
2. Check if analysis actually completed
3. Check console for errors

---

## 💡 Testing Tips

### For Quick Testing
- Use small repositories (< 50 dependencies)
- Use organizations with < 10 repositories
- Always check console for detailed logs

### For Thorough Testing
- Test with GitHub token
- Test without GitHub token
- Test different organization sizes
- Test rate limit handling (run without token on large org)
- Verify data persists after browser close
- Test on different browsers

### Performance Benchmarks
- Small repo (< 50 deps): 2-5 minutes
- Medium org (10-20 repos): 15-30 minutes
- Large org (50+ repos): 1-2 hours (with token)

---

## ✅ Success Criteria

**Test PASSES if:**
1. All 5 phases execute automatically
2. Progress shows "X/5" consistently (never "X/4")
3. No manual button clicks needed
4. Data appears on all relevant pages
5. No JavaScript errors in console
6. Data persists after page refresh

**Test FAILS if:**
- Progress shows "X/4" anywhere
- Phases 3, 4, or 5 require manual triggers
- Pages show "No data, click button to run analysis"
- JavaScript errors appear in console
- Analysis doesn't complete

---

## 📝 Reporting Issues

If you find issues, report:
1. Which test scenario you ran
2. What you expected to see
3. What you actually saw
4. Browser console errors (if any)
5. Screenshots of progress bar
6. Screenshots of data pages

---

## 🎯 Next Steps After Testing

If tests pass:
- ✅ Mark project as "Verified Working"
- ✅ Deploy to production
- ✅ Share with users

If tests fail:
- ❌ Document the failure
- ❌ Check console for errors
- ❌ Review code changes
- ❌ Fix and retest

---

**Happy Testing!** 🚀

*Testing Guide Created: October 17, 2025*  
*Integration Version: 2.0*  
*Expected Test Time: 5 minutes (quick) to 2 hours (thorough)*

