/**
 * SBOM Play - Main Application
 */
class SBOMPlayApp {
    constructor() {
        this.githubClient = new GitHubClient();
        this.sbomProcessor = new SBOMProcessor();
        this.storageManager = new StorageManager();
        
        // Initialize services
        this.osvService = new OSVService();
        this.licenseProcessor = new LicenseProcessor();
        this.ecosystemsService = new EcosystemsService();
        
        // Initialize author analyzer
        this.depsDevService = new DepsDevService();
        this.authorAnalyzer = new AuthorAnalyzer(
            this.ecosystemsService,
            this.depsDevService,
            this.storageManager
        );
        
        // Make services available globally
        window.osvService = this.osvService;
        window.licenseProcessor = this.licenseProcessor;
        window.storageManager = this.storageManager;
        window.viewManager = new ViewManager();
        
        this.isAnalyzing = false;
        this.rateLimitTimer = null;
        this.initialized = false;
        
        // Initialize app asynchronously
        this.initializeApp().then(() => {
            this.initialized = true;
            console.log('✅ App fully initialized');
        });
        
        // Debug: Log service initialization
        console.log('🔧 App initialization starting:');
        console.log(`  - GitHub Client: ${this.githubClient ? '✅' : '❌'}`);
        console.log(`  - SBOM Processor: ${this.sbomProcessor ? '✅' : '❌'}`);
        console.log(`  - OSV Service: ${this.osvService ? '✅' : '❌'}`);
        console.log(`  - License Processor: ${this.licenseProcessor ? '✅' : '❌'}`);
        console.log(`  - Storage Manager: ${this.storageManager ? '✅' : '❌'}`);
        console.log(`  - DepsDev Service: ${window.DepsDevService ? '✅' : '❌'}`);
    }

    /**
     * Initialize the application (async for IndexedDB)
     */
    async initializeApp() {
        try {
            // Initialize IndexedDB
            await this.storageManager.init();
            
            // Migrate from localStorage if needed (one-time)
            await this.storageManager.migrateFromLocalStorage();
            
            this.loadSavedToken();
            this.checkStorageAvailability();
            
            // Only initialize UI elements if they exist on the current page
            if (document.getElementById('storageStatus')) {
                await this.showStorageStatus();
            }
            if (document.getElementById('storageStatusIndicator')) {
                await this.showStorageStatusIndicator();
            }
            if (document.getElementById('resultsSection')) {
                await this.loadPreviousResults();
            }
            if (document.getElementById('githubToken') && document.getElementById('orgName') && document.getElementById('analyzeBtn')) {
                this.setupEventListeners();
            }
            if (document.getElementById('resumeSection')) {
                this.checkRateLimitState();
            }
            if (document.getElementById('orgName')) {
                this.handleURLParameters();
            }
            
            // Show results section if there are stored organizations
            const storageInfo = await this.storageManager.getStorageInfo();
            if (storageInfo.organizationsCount > 0 && document.getElementById('resultsSection')) {
                document.getElementById('resultsSection').style.display = 'block';
            }
            
            // Show Quick Analysis Access section if there are stored organizations
            if (storageInfo.organizationsCount > 0 && document.getElementById('quickAnalysisSection')) {
                document.getElementById('quickAnalysisSection').style.display = 'block';
            }
        } catch (error) {
            console.error('❌ Failed to initialize app:', error);
            this.showAlert('Failed to initialize storage. Please refresh the page.', 'danger');
        }
    }

    /**
     * Handle URL parameters for pre-filling and focusing
     */
    handleURLParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const orgParam = urlParams.get('org');
        const focusParam = urlParams.get('focus');
        
        if (orgParam) {
            // Pre-fill organization name
            document.getElementById('orgName').value = orgParam;
            
            // Handle different focus types
            if (focusParam) {
                let message = '';
                switch (focusParam) {
                    case 'license':
                        message = 'Organization pre-filled for license compliance analysis. Click "Start Analysis" to begin.';
                        break;
                    case 'deps':
                        message = 'Organization pre-filled for dependency analysis. Click "Start Analysis" to begin.';
                        break;
                    case 'vuln':
                        message = 'Organization pre-filled for vulnerability analysis. Click "Start Analysis" to begin.';
                        break;
                    default:
                        message = 'Organization pre-filled. Click "Start Analysis" to begin.';
                }
                
                this.showAlert(message, 'info');
                
                // Scroll to the organization input section
                document.getElementById('orgName').scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }

    /**
     * Check for existing rate limit state
     */
    checkRateLimitState() {
        const rateLimitState = this.githubClient.loadRateLimitState();
        if (rateLimitState) {
            const now = Math.floor(Date.now() / 1000);
            const timeElapsed = now - (rateLimitState.timestamp / 1000);
            const remainingWait = rateLimitState.waitTime - timeElapsed;
            
            if (remainingWait > 0) {
                this.showResumeSection(rateLimitState, remainingWait);
            } else {
                // Rate limit has expired, clear the state
                this.githubClient.clearRateLimitState();
            }
        }
    }

    /**
     * Show resume analysis section
     */
    showResumeSection(rateLimitState, remainingWait) {
        const resumeSection = document.getElementById('resumeSection');
        const resumeInfo = document.getElementById('resumeInfo');
        const resetDate = new Date(rateLimitState.resetTime * 1000);
        
        resumeInfo.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <p><strong>Organization:</strong> ${rateLimitState.organization}</p>
                    <p><strong>Reset Time:</strong> ${resetDate.toLocaleTimeString()}</p>
                </div>
                <div class="col-md-6">
                    <p><strong>Time Remaining:</strong> <span id="resumeCountdown">${this.formatTime(remainingWait)}</span></p>
                    <p><strong>Status:</strong> <span class="badge bg-warning">Waiting for Rate Limit Reset</span></p>
                </div>
            </div>
        `;
        
        resumeSection.style.display = 'block';
        
        // Start countdown for resume section
        this.startResumeCountdown(remainingWait);
    }

    /**
     * Start countdown timer for resume section
     */
    startResumeCountdown(seconds) {
        const countdownInterval = setInterval(() => {
            const countdownElement = document.getElementById('resumeCountdown');
            if (countdownElement) {
                countdownElement.textContent = this.formatTime(seconds);
            }
            
            seconds--;
            
            if (seconds <= 0) {
                clearInterval(countdownInterval);
                // Hide resume section and clear state
                document.getElementById('resumeSection').style.display = 'none';
                this.githubClient.clearRateLimitState();
            }
        }, 1000);
    }

    /**
     * Resume analysis
     */
    resumeAnalysis() {
        const rateLimitState = this.githubClient.loadRateLimitState();
        if (rateLimitState) {
            // Set the organization name
            document.getElementById('orgName').value = rateLimitState.organization;
            
            // Clear the rate limit state
            this.githubClient.clearRateLimitState();
            
            // Hide resume section
            document.getElementById('resumeSection').style.display = 'none';
            
            // Start analysis
            this.startAnalysis();
        }
    }

    /**
     * Clear rate limit state
     */
    clearRateLimitState() {
        this.githubClient.clearRateLimitState();
        document.getElementById('resumeSection').style.display = 'none';
        this.showAlert('Rate limit state cleared', 'info');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Token input validation
        document.getElementById('githubToken').addEventListener('input', (e) => {
            const token = e.target.value.trim();
            if (token && !token.startsWith('ghp_')) {
                this.updateTokenStatus('Token should start with "ghp_"', 'warning');
            } else if (token) {
                this.updateTokenStatus('Token format looks valid', 'success');
            } else {
                this.updateTokenStatus('', '');
            }
        });

        // Organization input validation
        document.getElementById('orgName').addEventListener('input', (e) => {
            const orgName = e.target.value.trim();
            const analyzeBtn = document.getElementById('analyzeBtn');
            analyzeBtn.disabled = !orgName || this.isAnalyzing;
        });

        // Rate limit event listeners
        this.githubClient.addEventListener('rateLimitExceeded', (event) => {
            this.showRateLimitWaiting(event.detail.waitTime, event.detail.resetTime);
        });

        this.githubClient.addEventListener('rateLimitReset', () => {
            this.hideRateLimitWaiting();
        });
    }

    /**
     * Show rate limit waiting message
     */
    showRateLimitWaiting(waitTime, resetTime) {
        const resetDate = new Date(resetTime * 1000);
        const resetTimeStr = resetDate.toLocaleTimeString();
        
        // Create or update prominent rate limit banner at top of page
        let rateLimitBanner = document.getElementById('rateLimitBanner');
        if (!rateLimitBanner) {
            rateLimitBanner = document.createElement('div');
            rateLimitBanner.id = 'rateLimitBanner';
            rateLimitBanner.className = 'alert alert-warning alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3';
            rateLimitBanner.style.zIndex = '9999';
            rateLimitBanner.style.maxWidth = '600px';
            rateLimitBanner.style.width = '90%';
            rateLimitBanner.style.backgroundColor = '#856404';
            rateLimitBanner.style.color = '#fff3cd';
            rateLimitBanner.style.border = '2px solid #ffc107';
            rateLimitBanner.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.3)';
            rateLimitBanner.style.borderRadius = '8px';
            document.body.appendChild(rateLimitBanner);
        }
        
        rateLimitBanner.innerHTML = `
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert" aria-label="Close"></button>
            <h5 class="alert-heading" style="color: #fff3cd; margin-bottom: 10px;"><i class="fas fa-clock me-2"></i>GitHub API Rate Limit Exceeded</h5>
            <p class="mb-2" style="color: #fff3cd;">The GitHub API rate limit has been reached. The analysis will automatically continue when the limit resets.</p>
            <hr style="border-color: rgba(255, 243, 205, 0.3);">
            <p class="mb-1" style="color: #fff3cd;"><strong>Reset Time:</strong> ${resetTimeStr}</p>
            <p class="mb-0" style="color: #fff3cd;"><strong>Time Remaining:</strong> <span id="rateLimitCountdown">${this.formatTime(waitTime)}</span></p>
            <small class="d-block mt-2" style="color: #ffc107;">
                <i class="fas fa-info-circle me-1"></i>
                Tip: Add a GitHub Personal Access Token in <a href="settings.html" style="color: #ffc107; text-decoration: underline;">Settings</a> to increase your rate limit from 60 to 5,000 requests/hour.
            </small>
        `;
        
        // Update progress section
        const progressSection = document.getElementById('progressSection');
        const progressText = document.getElementById('progressText');
        
        if (progressSection) {
            progressSection.classList.remove('hidden');
            progressSection.style.display = 'block';
            progressText.innerHTML = `
                <div class="alert alert-warning mb-0">
                    <h6><i class="fas fa-clock me-2"></i>Waiting for Rate Limit Reset</h6>
                    <p class="mb-0">Analysis will continue in <span id="progressRateLimitCountdown">${this.formatTime(waitTime)}</span></p>
                </div>
            `;
        }
        
        // Start countdown timer
        this.startRateLimitCountdown(waitTime);
        
        // Disable analyze button
        const analyzeBtn = document.getElementById('analyzeBtn');
        if (analyzeBtn) {
            analyzeBtn.disabled = true;
        }
    }

    /**
     * Hide rate limit waiting message
     */
    hideRateLimitWaiting() {
        // Remove rate limit banner
        const rateLimitBanner = document.getElementById('rateLimitBanner');
        if (rateLimitBanner) {
            rateLimitBanner.remove();
        }
        
        // Update progress text
        const progressText = document.getElementById('progressText');
        if (progressText) {
            progressText.textContent = 'Rate limit reset. Continuing analysis...';
        }
        
        // Re-enable analyze button
        const analyzeBtn = document.getElementById('analyzeBtn');
        if (analyzeBtn) {
            analyzeBtn.disabled = false;
        }
        
        // Clear countdown timer
        if (this.rateLimitTimer) {
            clearInterval(this.rateLimitTimer);
            this.rateLimitTimer = null;
        }
    }

    /**
     * Start countdown timer for rate limit
     */
    startRateLimitCountdown(waitTime) {
        if (this.rateLimitTimer) {
            clearInterval(this.rateLimitTimer);
        }
        
        let remaining = waitTime;
        this.rateLimitTimer = setInterval(() => {
            remaining--;
            const formattedTime = this.formatTime(remaining);
            
            // Update main countdown in banner
            const countdown = document.getElementById('rateLimitCountdown');
            if (countdown) {
                countdown.textContent = formattedTime;
            }
            
            // Update progress countdown if visible
            const progressCountdown = document.getElementById('progressRateLimitCountdown');
            if (progressCountdown) {
                progressCountdown.textContent = formattedTime;
            }
            
            if (remaining <= 0) {
                clearInterval(this.rateLimitTimer);
                this.rateLimitTimer = null;
            }
        }, 1000);
    }

    /**
     * Format time in seconds to human readable string
     */
    formatTime(seconds) {
        if (seconds < 60) {
            return `${seconds} second${seconds !== 1 ? 's' : ''}`;
        }
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ${secs} second${secs !== 1 ? 's' : ''}`;
    }

    /**
     * Load saved GitHub token
     */
    loadSavedToken() {
        // Don't load token from localStorage - tokens are not persisted
        // This method is kept for future use if needed
    }

    /**
     * Check if local storage is available and show status
     */
    checkStorageAvailability() {
        if (!this.storageManager.isStorageAvailable()) {
            this.showAlert('Local storage is not available. Some features may not work properly.', 'warning');
            return false;
        }
        
        // Show storage status
        const storageInfo = this.storageManager.showStorageStatus();
        if (storageInfo) {
            const usagePercent = (storageInfo.totalSize / storageInfo.maxStorageSize) * 100;
            
            if (usagePercent > 90) {
                this.showAlert('Storage is nearly full! Please export your data and clear old analyses.', 'danger');
            } else if (usagePercent > 70) {
                this.showAlert('Storage usage is high. Consider exporting data to free up space.', 'warning');
            }
        }
        
        return true;
    }

    /**
     * Load previous results
     */
    async loadPreviousResults() {
        const data = await this.storageManager.loadAnalysisData();
        if (data) {
            this.displayResults(data, data.organization);
        } else {
            // Show overview of stored organizations even if no current analysis
            this.displayResults(null, null);
        }
    }

    /**
     * Save GitHub token
     */
    saveToken() {
        const token = document.getElementById('githubToken').value.trim();
        
        if (token && !token.startsWith('ghp_')) {
            this.updateTokenStatus('Invalid token format. Should start with "ghp_"', 'danger');
            return;
        }

        this.githubClient.setToken(token);
        
        if (token) {
            this.updateTokenStatus('Token set successfully (not saved)', 'success');
        } else {
            this.updateTokenStatus('Token cleared', 'info');
        }
    }

    /**
     * Update token status display
     */
    updateTokenStatus(message, type) {
        const statusDiv = document.getElementById('tokenStatus');
        if (message) {
            statusDiv.innerHTML = `<div class="alert alert-${type} alert-sm">${message}</div>`;
        } else {
            statusDiv.innerHTML = '';
        }
    }

    /**
     * Start analysis
     */
    async startAnalysis() {
        const ownerName = document.getElementById('orgName').value.trim();
        
        if (!ownerName) {
            this.showAlert('Please enter an organization or user name', 'warning');
            return;
        }

        if (this.isAnalyzing) {
            return;
        }

        this.isAnalyzing = true;
        this.sbomProcessor.reset();
        
        // Store current owner for rate limit state
        localStorage.setItem('current_analysis_org', ownerName);
        
        // Update UI (only if elements exist)
        const analyzeBtn = document.getElementById('analyzeBtn');
        const progressSection = document.getElementById('progressSection');
        const resultsSection = document.getElementById('resultsSection');
        
        if (analyzeBtn) analyzeBtn.disabled = true;
        if (progressSection) {
            progressSection.classList.remove('hidden');
            progressSection.style.display = 'block';
        }
        if (resultsSection) resultsSection.style.display = 'none';
        
        this.updateProgress(0, 'Initializing analysis...');

        try {
            // Get rate limit info
            const rateLimitInfo = await this.githubClient.getRateLimitInfo();
            this.updateRateLimitInfo(rateLimitInfo);

            // Phase 1: Extract SBOM data (0-20%)
            this.updateProgress(0, '1/5 Extracting SBOM data...');
            const repositories = await this.githubClient.getRepositories(ownerName);
            
            if (repositories.length === 0) {
                this.showAlert('No public repositories found for this organization or user', 'info');
                this.finishAnalysis();
                return;
            }

            this.sbomProcessor.setTotalRepositories(repositories.length);
            
            // Show partial data info if we have many repositories
            const partialDataInfo = document.getElementById('partialDataInfo');
            if (repositories.length > 10 && partialDataInfo) {
                partialDataInfo.style.display = 'block';
            }

            // Process each repository for SBOM extraction
            let successfulRepos = 0;
            let failedRepos = 0;
            let reposWithDeps = 0;
            
            for (let i = 0; i < repositories.length; i++) {
                const repo = repositories[i];
                const owner = repo.owner.login;
                const name = repo.name;
                const progress = (i / repositories.length) * 20; // 0-20%
                
                this.updateProgress(progress, `1/5 Extracting SBOM from ${owner}/${name}...`);
                
                try {
                    const sbomData = await this.githubClient.fetchSBOM(owner, name);
                    
                    if (sbomData) {
                        console.log(`🔍 Processing SBOM for ${owner}/${name}: ${sbomData.sbom.packages.length} packages`);
                        const success = this.sbomProcessor.processSBOM(owner, name, sbomData);
                        this.sbomProcessor.updateProgress(success);
                        if (success) {
                            successfulRepos++;
                            const repoData = this.sbomProcessor.repositories.get(`${owner}/${name}`);
                            if (repoData && repoData.totalDependencies > 0) {
                                reposWithDeps++;
                                console.log(`✅ ${owner}/${name}: ${repoData.totalDependencies} dependencies processed`);
                            } else {
                                console.log(`⚠️ ${owner}/${name}: No dependencies found in SBOM`);
                            }
                        } else {
                            failedRepos++;
                            console.log(`❌ ${owner}/${name}: SBOM processing failed`);
                        }
                    } else {
                        this.sbomProcessor.updateProgress(false);
                        failedRepos++;
                        console.log(`ℹ️ ${owner}/${name}: No SBOM data available`);
                    }
                } catch (error) {
                    console.error(`Error processing ${owner}/${name}:`, error);
                    this.sbomProcessor.updateProgress(false);
                    failedRepos++;
                }

                // Save incrementally every 10 repositories
                if ((i + 1) % 10 === 0 || i === repositories.length - 1) {
                    console.log(`💾 Saving incremental data (${i + 1}/${repositories.length} repositories processed)`);
                    
                    const partialData = this.sbomProcessor.exportPartialData();
                    const isComplete = (i === repositories.length - 1);
                    
                    const saveSuccess = this.storageManager.saveIncrementalAnalysisData(ownerName, partialData, isComplete);
                    if (saveSuccess) {
                        console.log(`✅ Incremental data saved for ${ownerName} (${isComplete ? 'complete' : 'partial'})`);
                        
                        // Check data size and warn if too large
                        const sizeCheck = this.storageManager.checkDataSizeAndWarn(ownerName);
                        if (sizeCheck.isLarge) {
                            this.showAlert(sizeCheck.message, 'warning');
                        }
                        
                        // Clear memory after successful save to prevent DOM from holding unnecessary data
                        this.sbomProcessor.clearMemoryAfterSave();
                        
                        // Update storage indicators (only show indicator, not full status)
                        this.showStorageStatusIndicator();
                    } else {
                        console.warn(`⚠️ Failed to save incremental data for ${ownerName}`);
                    }
                }

                // Add small delay to be respectful to GitHub API
                await this.sleep(100);
            }

            // Phase 2: Transitive dependency extraction (20-40%)
            // Check if we have any dependencies to analyze (not just repositories with deps)
            const totalDependencies = this.sbomProcessor.dependencies.size;
            if (totalDependencies > 0) {
                this.updateProgress(20, '2/5 Extracting transitive dependencies...');
                try {
                    const depsDevAnalysis = await this.sbomProcessor.analyzeDepsDevEnrichment(
                        (progress, message) => {
                            // Map 0-100 progress to 20-40 range
                            const mappedProgress = 20 + (progress * 0.20);
                            this.updateProgress(mappedProgress, `2/5 ${message}`);
                        }
                    );
                    if (depsDevAnalysis) {
                        console.log('🔍 DepsDev Enrichment Analysis Results:', depsDevAnalysis);
                    }
                } catch (error) {
                    console.error('❌ DepsDev enrichment analysis failed:', error);
                }
            } else {
                console.log('⚠️ No dependencies found to analyze');
            }

            // Phase 3: Vulnerability analysis (40-60%)
            if (totalDependencies > 0) {
                this.updateProgress(40, '3/5 Analyzing vulnerabilities...');
                try {
                    const vulnerabilityAnalysis = await this.sbomProcessor.analyzeVulnerabilities(
                        (progress, message) => {
                            // Map 0-100 progress to 40-60 range
                            const mappedProgress = 40 + (progress * 0.20);
                            this.updateProgress(mappedProgress, `3/5 ${message}`);
                        }
                    );
                    if (vulnerabilityAnalysis) {
                        console.log('🔍 Vulnerability Analysis Results:', vulnerabilityAnalysis);
                    }
                } catch (error) {
                    console.error('❌ Vulnerability analysis failed:', error);
                }
            } else {
                console.log('⚠️ No dependencies found for vulnerability analysis');
            }

            // Phase 4: License compliance (60-80%)
            if (totalDependencies > 0) {
                this.updateProgress(60, '4/5 Analyzing license compliance...');
                try {
                    const licenseAnalysis = this.sbomProcessor.analyzeLicenseCompliance(
                        (progress, message) => {
                            // Map 0-100 progress to 60-80 range
                            const mappedProgress = 60 + (progress * 0.20);
                            this.updateProgress(mappedProgress, `4/5 ${message}`);
                        }
                    );
                    if (licenseAnalysis) {
                        console.log('🔍 License Compliance Analysis Results:', licenseAnalysis);
                    }
                } catch (error) {
                    console.error('❌ License compliance analysis failed:', error);
                }
            } else {
                console.log('⚠️ No dependencies found for license analysis');
            }

            // Phase 5: Author Analysis (80-95%)
            if (totalDependencies > 0) {
                try {
                    this.updateProgress(80, '5/5 Analyzing package authors...');
                    console.log('👤 Starting author analysis...');
                    
                    // Prepare dependencies array with ecosystem information
                    const dependenciesArray = Array.from(this.sbomProcessor.dependencies.values()).map(dep => ({
                        name: dep.name,
                        version: dep.version,
                        ecosystem: dep.category?.ecosystem || 'Unknown',
                        isDirect: true, // From SBOM, these are direct dependencies
                        author: dep.author,
                        authorDisplayName: dep.authorDisplayName,
                        authorEmail: dep.authorEmail,
                        homepage: dep.homepage
                    }));
                    
                    // Run author analysis with progress updates
                    const authorData = await this.authorAnalyzer.analyzeAuthors(
                        dependenciesArray,
                        this.sbomProcessor.depsDevAnalysis, // Transitive data
                        ownerName,
                        (progress, message) => {
                            // Map 0-100 progress to 80-95 range
                            const mappedProgress = 80 + (progress * 0.15);
                            this.updateProgress(mappedProgress, `5/5 ${message}`);
                        }
                    );
                    
                    console.log(`✅ Author analysis complete: ${authorData.length} unique authors found`);
                    
                    // Show author analysis section and render data
                    const authorSection = document.getElementById('authorAnalysisSection');
                    if (authorSection && window.viewManager) {
                        authorSection.classList.remove('hidden');
                        window.viewManager.renderAuthorAnalysis(authorData, 'author-analysis-container');
                    }
                } catch (error) {
                    console.error('❌ Author analysis failed:', error);
                    // Don't fail the entire analysis if author analysis fails
                }
            }
            
            // Generate final results
            this.updateProgress(95, 'Generating final analysis results...');
            const results = this.sbomProcessor.exportData();
            
            // Log summary
            console.log(`📊 Analysis Summary for ${ownerName}:`);
            console.log(`   Total repositories: ${repositories.length}`);
            console.log(`   Successful: ${successfulRepos}`);
            console.log(`   Failed: ${failedRepos}`);
            console.log(`   With dependencies: ${reposWithDeps}`);
            console.log(`   Total unique dependencies: ${totalDependencies}`);
            
            // Log deps.dev enrichment impact
            if (this.sbomProcessor.depsDevAnalysis) {
                console.log(`🔍 DepsDev Enrichment Impact:`);
                console.log(`   - Direct dependencies analyzed: ${this.sbomProcessor.depsDevAnalysis.totalDependencies}`);
                console.log(`   - Dependencies with transitive deps: ${this.sbomProcessor.depsDevAnalysis.summary.dependenciesWithTransitive}`);
                console.log(`   - Total transitive dependencies found: ${this.sbomProcessor.depsDevAnalysis.summary.totalTransitiveDependencies}`);
                console.log(`   - Average transitive deps per package: ${this.sbomProcessor.depsDevAnalysis.summary.averageTransitiveDependencies.toFixed(1)}`);
                
                if (this.sbomProcessor.vulnerabilityAnalysisMetrics) {
                    console.log(`🔍 Vulnerability Analysis Impact:`);
                    console.log(`   - Direct dependencies: ${this.sbomProcessor.vulnerabilityAnalysisMetrics.directDependencies}`);
                    console.log(`   - Transitive dependencies added: ${this.sbomProcessor.vulnerabilityAnalysisMetrics.transitiveDependencies}`);
                    console.log(`   - Total analyzed: ${this.sbomProcessor.vulnerabilityAnalysisMetrics.totalDependencies}`);
                    console.log(`   - Increase: ${this.sbomProcessor.vulnerabilityAnalysisMetrics.increasePercentage}%`);
                }
                
                if (this.sbomProcessor.licenseAnalysisMetrics) {
                    console.log(`🔍 License Analysis Impact:`);
                    console.log(`   - Direct dependencies: ${this.sbomProcessor.licenseAnalysisMetrics.directDependencies}`);
                    console.log(`   - Transitive dependencies added: ${this.sbomProcessor.licenseAnalysisMetrics.transitiveDependencies}`);
                    console.log(`   - Total analyzed: ${this.sbomProcessor.licenseAnalysisMetrics.totalDependencies}`);
                    console.log(`   - Increase: ${this.sbomProcessor.licenseAnalysisMetrics.increasePercentage}%`);
                }
            }
            
            if (totalDependencies === 0) {
                console.log(`⚠️  No dependencies found. This could be because:`);
                console.log(`   1. Dependency Graph is not enabled on the repositories`);
                console.log(`   2. Repositories don't have dependency files (package.json, requirements.txt, etc.)`);
                console.log(`   3. Authentication is required for private repositories`);
                console.log(`   4. Rate limiting prevented access to some repositories`);
                console.log(`   5. SBOM data doesn't contain package information`);
            }
            
            // Save to storage with better error handling
            const saveSuccess = this.storageManager.saveAnalysisData(ownerName, results);
            if (!saveSuccess) {
                console.warn('⚠️ Failed to save analysis data to storage');
                this.showAlert('Analysis completed but failed to save to storage. Consider exporting your data and clearing old analyses.', 'warning');
            } else {
                // Update storage indicators after successful save (only indicator, not full status)
                this.showStorageStatusIndicator();
            }
            
            // Display results
            this.displayResults(results, ownerName);
            
            // Show deps.dev enrichment summary if available
            if (this.sbomProcessor.depsDevAnalysis) {
                this.showDepsDevSummary();
            }
            
            // Show message about partial data availability
            if (repositories.length > 10) {
                this.showAlert(
                    `Analysis complete! Data was saved incrementally every 10 repositories, so you can start exploring results even during long analyses.`,
                    'success'
                );
            }
            
            this.updateProgress(100, 'Analysis complete!');
            
        } catch (error) {
            console.error('Analysis failed:', error);
            this.showAlert(`Analysis failed: ${error.message}`, 'danger');
        } finally {
            this.finishAnalysis();
        }
    }

    /**
     * Update progress display
     */
    updateProgress(percentage, message) {
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        const phaseInfo = document.getElementById('phaseInfo');
        const currentPhase = document.getElementById('currentPhase');
        
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
            progressBar.textContent = `${Math.round(percentage)}%`;
        }
        
        if (progressText) {
            progressText.textContent = message;
        }

        // Show phase information if message contains phase indicator
        if (phaseInfo && currentPhase && message.includes('/4')) {
            phaseInfo.style.display = 'block';
            currentPhase.textContent = message;
        }
        
        // Log progress for pages without UI elements
        if (!progressBar && !progressText) {
            console.log(`Progress: ${Math.round(percentage)}% - ${message}`);
        }
    }

    /**
     * Update rate limit information
     */
    updateRateLimitInfo(info) {
        const rateLimitDiv = document.getElementById('rateLimitInfo');
        if (rateLimitDiv) {
            const resetTime = new Date(info.reset * 1000).toLocaleTimeString();
            
            rateLimitDiv.innerHTML = `
                <div class="alert alert-info alert-sm">
                    <strong>Rate Limit:</strong> ${info.remaining}/${info.limit} requests remaining
                    <br><strong>Reset Time:</strong> ${resetTime}
                    <br><strong>Authenticated:</strong> ${info.authenticated}
                </div>
            `;
        }
    }

    /**
     * Display analysis results
     */
    displayResults(results, ownerName) {
        const resultsSection = document.getElementById('resultsSection');
        const resultsContent = document.getElementById('resultsContent');
        
        // Check if the results elements exist on this page
        if (!resultsSection || !resultsContent) {
            console.log('Results section elements not found on this page');
            return;
        }
        
        // Get storage info to show all organizations
        const storageInfo = this.storageManager.getStorageInfo();
        const organizations = storageInfo?.organizations || [];
        
        // Get combined stats if multiple organizations exist
        const combinedData = organizations.length > 1 ? this.storageManager.getCombinedData() : null;
        
        let html = '';
        
        // Note: Analysis completion is handled by the progress section
        // The results section focuses on stored data overview
        
        // Show stored organizations overview
        if (organizations.length > 0) {
            html += `
                <div class="row mb-4">
                    <div class="col-12">
                        <h6><i class="fas fa-database me-2"></i>Stored Organizations (${organizations.length})</h6>
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Organization</th>
                                        <th>Repositories</th>
                                        <th>Dependencies</th>
                                        <th>Last Updated</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${organizations.map(org => {
                                        const date = new Date(org.timestamp).toLocaleDateString();
                                        const time = new Date(org.timestamp).toLocaleTimeString();
                                        return `
                                            <tr>
                                                <td><strong>${org.name}</strong></td>
                                                <td><span class="badge bg-primary">${org.repositories}</span></td>
                                                <td><span class="badge bg-success">${org.dependencies}</span></td>
                                                <td><small>${date} ${time}</small></td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }
        

        
        // Show no data message if no organizations stored
        if (organizations.length === 0) {
            html += `
                <div class="alert alert-info">
                    <h6><i class="fas fa-info-circle me-2"></i>No Stored Analyses</h6>
                    <p class="mb-2">You haven't analyzed any organizations yet. Start your first analysis above!</p>
                </div>
            `;
        }
        
        resultsContent.innerHTML = html;
        resultsSection.style.display = 'block';
        
        // Show/hide Quick Analysis Access section based on stored organizations
        const quickAnalysisSection = document.getElementById('quickAnalysisSection');
        if (quickAnalysisSection) {
            if (organizations.length > 0) {
                quickAnalysisSection.style.display = 'block';
            } else {
                quickAnalysisSection.style.display = 'none';
            }
        }
    }

    /**
     * Export current results
     */
    exportResults() {
        const currentData = this.storageManager.loadAnalysisData();
        if (currentData) {
            const filename = `sbom-analysis-${currentData.organization}-${new Date().toISOString().split('T')[0]}.json`;
            this.storageManager.exportData(currentData, filename);
        } else {
            this.showAlert('No data to export', 'warning');
        }
    }



    /**
     * Clear current data
     */
    async clearData() {
        const currentData = await this.storageManager.loadAnalysisData();
        if (currentData) {
            if (confirm(`Are you sure you want to remove data for ${currentData.organization}?`)) {
                await this.storageManager.removeOrganizationData(currentData.organization);
                this.displayResults(null, null); // Refresh display
                this.showAlert('Data cleared successfully', 'success');
                await this.showStorageStatusIndicator();
            }
        } else {
            this.showAlert('No data to clear', 'warning');
        }
    }

    /**
     * Show storage status in UI
     */
    async showStorageStatus() {
        const storageInfo = await this.storageManager.getStorageInfo();
        const storageStatusDiv = document.getElementById('storageStatus');
        
        // Check if the storage status div exists on this page
        if (!storageStatusDiv) {
            console.log('Storage status div not found on this page');
            return;
        }
        
        if (storageInfo) {
            const usagePercent = (storageInfo.totalSize / storageInfo.maxStorageSize) * 100;
            const usageClass = usagePercent > 90 ? 'danger' : usagePercent > 70 ? 'warning' : 'success';
            
            storageStatusDiv.innerHTML = `
                <div class="alert alert-${usageClass}">
                    <h6><i class="fas fa-hdd me-2"></i>Storage Status</h6>
                    <div class="row">
                        <div class="col-md-6">
                            <strong>Usage:</strong> ${(storageInfo.totalSize / 1024 / 1024).toFixed(2)}MB / ${(storageInfo.maxStorageSize / 1024 / 1024).toFixed(2)}MB (${usagePercent.toFixed(1)}%)
                        </div>
                        <div class="col-md-6">
                            <strong>Available:</strong> ${(storageInfo.availableSpace / 1024 / 1024).toFixed(2)}MB
                        </div>
                    </div>
                    <div class="row mt-2">
                        <div class="col-md-6">
                            <strong>Organizations:</strong> ${storageInfo.organizationsCount}
                        </div>
                        <div class="col-md-6">
                            <strong>History Entries:</strong> ${storageInfo.historyCount}
                        </div>
                    </div>
                    ${usagePercent > 80 ? '<div class="mt-2"><strong>⚠️ Warning:</strong> Storage usage is high. Consider exporting data.</div>' : ''}
                </div>
            `;
        } else {
            storageStatusDiv.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Unable to retrieve storage status
                </div>
            `;
        }
    }

    /**
     * Show storage status indicator in header
     */
    async showStorageStatusIndicator() {
        const storageInfo = await this.storageManager.getStorageInfo();
        const indicatorDiv = document.getElementById('storageStatusIndicator');
        const statusTextDiv = document.getElementById('storageStatusText');
        
        // Check if the indicator elements exist on this page
        if (!indicatorDiv || !statusTextDiv) {
            console.log('Storage status indicator elements not found on this page');
            return;
        }
        
        if (storageInfo && storageInfo.hasData) {
            const usagePercent = (storageInfo.totalSize / storageInfo.maxStorageSize) * 100;
            let statusClass = 'text-muted';
            let statusIcon = 'fas fa-hdd';
            
            if (usagePercent > 90) {
                statusClass = 'text-danger';
                statusIcon = 'fas fa-exclamation-triangle';
            } else if (usagePercent > 70) {
                statusClass = 'text-warning';
                statusIcon = 'fas fa-exclamation-circle';
            } else if (usagePercent > 30) {
                statusClass = 'text-info';
                statusIcon = 'fas fa-info-circle';
            }
            
            statusTextDiv.innerHTML = `
                <i class="${statusIcon} me-1"></i>
                <span class="${statusClass}">
                    ${(storageInfo.totalSize / 1024 / 1024).toFixed(2)}MB used (${usagePercent.toFixed(1)}%) - 
                    ${storageInfo.organizationsCount} organizations stored
                </span>
            `;
            
            indicatorDiv.style.display = 'block';
        } else {
            indicatorDiv.style.display = 'none';
        }
    }

    /**
     * Export all data
     */
    async exportAllData() {
        try {
            const filename = `sbom-all-data-${new Date().toISOString().split('T')[0]}.json`;
            await this.storageManager.exportAllData(filename);
            this.showAlert('All data exported successfully', 'success');
        } catch (error) {
            console.error('Export failed:', error);
            this.showAlert('Failed to export data', 'danger');
        }
    }

    /**
     * Clear old data (keep only recent)
     */
    clearOldData() {
        if (confirm('This will remove old analysis data while keeping the most recent. Continue?')) {
            try {
                const storageInfo = this.storageManager.getStorageInfo();
                const organizations = storageInfo.organizations;
                
                if (organizations.length <= 3) {
                    this.showAlert('Not enough data to clear. Keep at least 3 recent analyses.', 'info');
                    return;
                }
                
                // Keep only the 3 most recent organizations
                organizations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                const toRemove = organizations.slice(3);
                
                let removedCount = 0;
                for (const org of toRemove) {
                    if (this.storageManager.removeOrganizationData(org.name)) {
                        removedCount++;
                    }
                }
                
                this.showAlert(`Cleared ${removedCount} old analyses. Kept 3 most recent.`, 'success');
                this.displayResults(null, null); // Refresh display
                this.showStorageStatusIndicator(); // Update header indicator
            } catch (error) {
                console.error('Clear old data failed:', error);
                this.showAlert('Failed to clear old data', 'danger');
            }
        }
    }

    /**
     * Clear all data
     */
    clearAllData() {
        if (confirm('Are you sure you want to clear ALL stored data? This action cannot be undone.')) {
            try {
                this.storageManager.clearAllData();
                this.showAlert('All data cleared successfully', 'success');
                this.displayResults(null, null); // Refresh display
                this.showStorageStatusIndicator(); // Update header indicator
            } catch (error) {
                console.error('Clear all data failed:', error);
                this.showAlert('Failed to clear all data', 'danger');
            }
        }
    }

    /**
     * Test storage quota management
     */
    testStorageQuota() {
        try {
            const testResults = this.storageManager.testStorageQuota();
            if (testResults) {
                console.log('🧪 Storage quota test results:', testResults);
                this.showAlert(`Storage test completed. Check console for details. Compression ratio: ${testResults.compressionRatio.toFixed(1)}%`, 'info');
            } else {
                this.showAlert('Storage test failed. Check console for details.', 'warning');
            }
        } catch (error) {
            console.error('Storage test failed:', error);
            this.showAlert('Storage test failed', 'danger');
        }
    }

    /**
     * Migrate old data to new compressed format
     */
    migrateOldData() {
        try {
            const migratedCount = this.storageManager.migrateOldData();
            if (migratedCount > 0) {
                this.showAlert(`Successfully migrated ${migratedCount} organizations to compressed format.`, 'success');
                this.showStorageStatusIndicator(); // Update header indicator
            } else {
                this.showAlert('No old data found to migrate. All data is already in compressed format.', 'info');
            }
        } catch (error) {
            console.error('Migration failed:', error);
            this.showAlert('Failed to migrate old data', 'danger');
        }
    }

    /**
     * Finish analysis and reset UI
     */
    finishAnalysis() {
        this.isAnalyzing = false;
        
        const analyzeBtn = document.getElementById('analyzeBtn');
        const progressSection = document.getElementById('progressSection');
        const partialDataInfo = document.getElementById('partialDataInfo');
        
        if (analyzeBtn) analyzeBtn.disabled = false;
        if (progressSection) {
            progressSection.classList.add('hidden');
            progressSection.style.display = 'none';
        }
        if (partialDataInfo) partialDataInfo.style.display = 'none';
    }

    /**
     * Show alert message
     */
    showAlert(message, type) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        const container = document.querySelector('.container');
        if (container) {
            container.insertBefore(alertDiv, container.firstChild);
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (alertDiv.parentNode) {
                    alertDiv.remove();
                }
            }, 5000);
        } else {
            // Fallback: just log to console if no container found
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * Show deps.dev enrichment summary
     */
    showDepsDevSummary() {
        const depsDevAnalysis = this.sbomProcessor.depsDevAnalysis;
        const vulnMetrics = this.sbomProcessor.vulnerabilityAnalysisMetrics;
        const licenseMetrics = this.sbomProcessor.licenseAnalysisMetrics;
        
        let summaryHtml = `
            <div class="alert alert-info mt-3">
                <h6><i class="fas fa-sitemap me-2"></i>DepsDev Enrichment Summary</h6>
                <div class="row">
                    <div class="col-md-4">
                        <strong>Direct Dependencies:</strong> ${depsDevAnalysis.totalDependencies}<br>
                        <strong>With Transitive:</strong> ${depsDevAnalysis.summary.dependenciesWithTransitive}<br>
                        <strong>Total Transitive:</strong> ${depsDevAnalysis.summary.totalTransitiveDependencies}
                    </div>
        `;
        
        if (vulnMetrics) {
            summaryHtml += `
                    <div class="col-md-4">
                        <strong>Vulnerability Analysis:</strong><br>
                        Direct: ${vulnMetrics.directDependencies} → Total: ${vulnMetrics.totalDependencies}<br>
                        <span class="text-success">+${vulnMetrics.transitiveDependencies} transitive (+${vulnMetrics.increasePercentage}%)</span>
                    </div>
            `;
        }
        
        if (licenseMetrics) {
            summaryHtml += `
                    <div class="col-md-4">
                        <strong>License Analysis:</strong><br>
                        Direct: ${licenseMetrics.directDependencies} → Total: ${licenseMetrics.totalDependencies}<br>
                        <span class="text-success">+${licenseMetrics.transitiveDependencies} transitive (+${licenseMetrics.increasePercentage}%)</span>
                    </div>
            `;
        }
        
        summaryHtml += `
                </div>
            </div>
        `;
        
        // Add to results section if it exists
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection) {
            const resultsContent = document.getElementById('resultsContent');
            if (resultsContent) {
                resultsContent.insertAdjacentHTML('beforeend', summaryHtml);
            }
        }
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }




}

// Global functions for HTML onclick handlers
function saveToken() {
    app.saveToken();
}

function startAnalysis() {
    app.startAnalysis();
}

function toggleTokenSection() {
    const body = document.getElementById('tokenSectionBody');
    const icon = document.getElementById('tokenToggleIcon');
    
    if (body.style.display === 'none') {
        body.style.display = 'block';
        icon.className = 'fas fa-chevron-up';
    } else {
        body.style.display = 'none';
        icon.className = 'fas fa-chevron-down';
    }
}

// Initialize app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    // Always initialize the app - it's needed for analysis functions
    app = new SBOMPlayApp();
    window.app = app; // Make app available globally
}); 