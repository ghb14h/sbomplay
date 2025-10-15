# SBOM Play

A web-based tool for analyzing Software Bill of Materials (SBOM) data from GitHub repositories, organizations, and users.

## Features

- **Organization & User Analysis**: Analyze SBOM data from GitHub organizations and users
- **Single Repository Analysis**: Dedicated tool for deep-dive analysis of individual repositories with enhanced dependency tracking
- **Dependency Tracking**: Track dependency usage across repositories with transitive dependency detection
- **Vulnerability Analysis**: Integration with OSV database for security vulnerability detection
- **License Compliance**: Automated license compatibility checking and conflict detection
- **Version Drift Detection**: Track outdated dependencies with deps.dev integration
- **Distribution Reports**: Generate comprehensive dependency distribution reports
- **Export & Import**: Export analysis results as JSON
- **Rate Limit Handling**: Automatic rate limit detection and recovery
- **Multi-Organization Storage**: Keep data for all analyzed organizations until manually cleared
- **Cyfinoid Branding**: Professional dark/light theme with the Sen font family
- **Theme Toggle**: Switch between dark and light modes on all pages
- **Persistent Storage**: All analysis data is saved and persists between sessions

## Quick Start

1. Open `index.html` in your web browser
2. Optionally enter a GitHub Personal Access Token for better rate limits
3. Enter an organization name or username to analyze
4. Click "Analyze Organization or User" to start the analysis
5. View results and export data as needed

## Development & Deployment

### Development Workflow
1. **Work in root folder** - Edit HTML files, `js/`, and `css/` directly
2. **Test locally** - Open `index.html` in browser to test
3. **Commit changes** - Push to your repository
4. **Deploy**: Deployment happens automatically via GitHub Actions

### GitHub Actions Deployment

The project uses GitHub Actions for automated deployment to GitHub Pages. Deployment is triggered:

- **Manually**: Go to Actions tab → "Deploy to GitHub Pages" → Run workflow
- **On Release**: When a new release is published

#### Setup GitHub Actions Deployment
1. Go to repository Settings → Pages
2. Source: **GitHub Actions** (not "Deploy from a branch")
3. The workflow file is at `.github/workflows/deploy.yml`
4. Your site will be at: `https://yourusername.github.io/sbomplay/`

#### Legacy Deployment (deprecated)
The `docs/` folder is no longer used for deployment. A backup has been saved as `backup_docs.zip` in the root directory for reference.

### Project Structure

```
sbomplay/
├── index.html              # Main organization analysis page
├── singlerepo.html         # Single repository analysis tool
├── stats.html              # Statistics dashboard
├── deps.html               # Dependency overview
├── vuln.html               # Vulnerability analysis
├── license-compliance.html # License compliance checker
├── settings.html           # Settings and storage management
├── css/
│   └── style.css           # Unified Cyfinoid branding styles
├── js/
│   ├── app.js              # Main application logic
│   ├── github-client.js    # GitHub API integration
│   ├── sbom-processor.js   # SBOM data processing
│   ├── osv-service.js      # Vulnerability checking (OSV)
│   ├── license-processor.js # License compliance
│   ├── storage-manager.js  # LocalStorage management
│   ├── view-manager.js     # UI rendering
│   ├── settings.js         # Settings page logic
│   └── services/
│       ├── deps-dev-service.js      # deps.dev integration
│       └── github-actions-service.js # GitHub Actions analysis
├── documentation/          # All documentation markdown files
│   ├── brandingguidelines.md
│   ├── ENHANCEMENTS-README.md
│   └── ... (other .md files)
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Actions deployment workflow
├── backup_docs.zip         # Backup of old docs/ folder
├── README.md               # This file
└── LICENSE                 # MIT License
```

## Recent Fixes

### SBOM Processing Issue (Fixed)
The tool now correctly processes GitHub's SBOM data format. The issue was that GitHub's SBOM API uses `versionInfo` instead of `version` for package versions. This has been fixed and the tool should now properly capture dependencies.

### Organization and User Support (Added)
The tool now supports analyzing both GitHub organizations and individual users. It automatically detects whether the input is an organization or user and uses the appropriate API endpoint.

### Multi-Organization Storage (Added)
The tool now maintains data for all analyzed organizations and users until manually cleared. Features include:
- **Persistent Storage**: All analysis data is saved and persists between sessions
- **Organization Overview**: View all stored analyses with statistics
- **Individual Management**: Load, view, or remove specific organization data
- **Bulk Operations**: Export all data or clear all stored analyses
- **Smart Updates**: Re-analyzing an organization updates existing data instead of creating duplicates

## Storage Management

### IndexedDB Storage

SBOM Play uses browser IndexedDB to store analysis data. **IndexedDB provides unlimited storage capacity** (no 5MB limit like localStorage), allowing you to analyze and store large organizations without worrying about quota limits.

#### Key Features
- **Unlimited Capacity**: Store 100+ MB of analysis data without issues
- **Fast Performance**: Indexed queries for quick data retrieval
- **Automatic Migration**: Seamlessly migrates from old localStorage data (one-time)
- **Smart Limits**: Maximum 50 organizations and 100 history entries stored (auto-cleanup)
- **Real-time Tracking**: Monitor storage usage across all your analyses

#### Manual Management
- **Storage Status**: Check current usage and available space
- **Export Data**: Export all data before clearing to preserve results
- **Clear Old Data**: Remove old analyses while keeping recent ones
- **Clear All Data**: Complete reset of stored data

#### Browser Compatibility
IndexedDB is supported by all modern browsers:
- ✅ Chrome 24+
- ✅ Firefox 16+
- ✅ Safari 10+
- ✅ Edge 12+
- ✅ All modern mobile browsers

**No more storage quota errors!** IndexedDB automatically handles large datasets that would have exceeded the old 5MB localStorage limit.

## Troubleshooting

### No Dependencies Found

If the analysis shows 0 dependencies, this is usually due to one of these reasons:

#### 1. Dependency Graph Not Enabled
GitHub's Dependency Graph feature must be enabled on repositories for SBOM data to be available.

**To enable Dependency Graph:**
- Go to the repository on GitHub
- Navigate to Settings → Security & analysis
- Enable "Dependency graph" under "Security & analysis"
- This requires admin access to the repository

#### 2. No Dependency Files
Repositories need to have dependency files for the Dependency Graph to work:

**Supported file types:**
- `package.json` (Node.js)
- `requirements.txt` (Python)
- `Gemfile` (Ruby)
- `pom.xml` (Java/Maven)
- `build.gradle` (Java/Gradle)
- `Cargo.toml` (Rust)
- `composer.json` (PHP)
- And many more...

#### 3. Authentication Required
- Private repositories require a GitHub Personal Access Token
- Some organizations may have restricted access
- Rate limits are higher with authentication

#### 4. Rate Limiting
- Without authentication: 60 requests/hour
- With authentication: 5,000 requests/hour
- The tool handles rate limiting automatically

### Common Error Messages

- **"Dependency graph not enabled"**: The repository doesn't have Dependency Graph enabled
- **"Access denied"**: Repository is private or requires authentication
- **"Rate limit exceeded"**: Too many requests, will retry automatically
- **"Organization not found"**: Check the organization name spelling

### Best Practices

1. **Use a GitHub Token**: Provides higher rate limits and access to private repositories
2. **Enable Dependency Graph**: Ensure repositories have this feature enabled
3. **Check Repository Settings**: Verify repositories have dependency files
4. **Monitor Console**: Check browser console for detailed error messages

## Technical Details

- Uses GitHub's Dependency Graph API
- Supports all GitHub-supported dependency file formats
- Handles rate limiting with automatic retry
- Stores results in browser localStorage
- No server-side processing required
- Correctly processes GitHub's SBOM format (`versionInfo` field)

## Rate Limits

- **Unauthenticated**: 60 requests/hour
- **Authenticated**: 5,000 requests/hour
- The tool automatically handles rate limiting and waits for reset

## Browser Compatibility

- Modern browsers with ES6+ support
- Requires localStorage support
- No external dependencies

## Project Structure

```
sbomplay/
├── index.html              # Main application
├── js/                     # JavaScript files
│   ├── app.js
│   ├── github-client.js
│   ├── sbom-processor.js
│   └── storage-manager.js
├── css/                    # CSS files
│   └── style.css
├── docs/                   # Production deployment (for GitHub Pages)
├── test-*.html            # Optional test files
└── legacy/                 # Old Python scripts (deprecated)
```

## License

MIT License - see LICENSE file for details.
