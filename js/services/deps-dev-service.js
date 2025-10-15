/**
 * DepsDevService - Integrates with deps.dev v3 API for dependency enrichment
 * https://deps.dev/docs/api/
 */
class DepsDevService {
    constructor() {
        this.baseUrl = 'https://api.deps.dev/v3'; // Use v3, not v3alpha
        this.cache = new Map(); // Simple in-memory cache
        this.cacheTimeout = 10 * 60 * 1000; // 10 minutes
        this.rateLimitDelay = 100; // ms between requests to be respectful
    }

    /**
     * Fetch the full dependency tree for a given package/version/ecosystem
     * @param {string} system - e.g., 'npm', 'pypi', 'maven', etc.
     * @param {string} packageName
     * @param {string} version
     * @returns {Promise<Object>} Dependency tree data
     */
    async fetchDependencyTree(system, packageName, version) {
        const cacheKey = `tree:${system}:${packageName}:${version}`;
        
        // Check cache first
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log(`📦 DepsDev: Using cached dependency tree for ${system}:${packageName}:${version}`);
                return cached.data;
            }
        }

        try {
            console.log(`🔍 DepsDev: Fetching dependency tree for ${system}:${packageName}:${version}`);
            
            const url = `${this.baseUrl}/systems/${encodeURIComponent(system)}/packages/${encodeURIComponent(packageName)}/versions/${encodeURIComponent(version)}:dependencies`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'SBOM-Play/1.0'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ DepsDev: API error for ${system}:${packageName}:${version}:`, errorText);
                throw new Error(`DepsDev API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            
            // Cache the result
            this.cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });

            console.log(`✅ DepsDev: Found dependency tree for ${system}:${packageName}:${version}`);
            return data;
        } catch (error) {
            console.error(`❌ DepsDev: Failed to fetch dependency tree for ${system}:${packageName}:${version}:`, error);
            throw error;
        }
    }

    /**
     * Validate if a version string is a specific version (not a range/wildcard)
     * @param {string} version - Version string to validate
     * @returns {boolean} True if version is specific, false if it's a range/wildcard
     */
    isValidSpecificVersion(version) {
        if (!version || typeof version !== 'string') {
            return false;
        }
        
        // Check for common version range/wildcard indicators
        const invalidPatterns = [
            '*',           // Wildcards
            'x',           // Wildcards (e.g., 1.x.x)
            '^',           // Caret ranges
            '~',           // Tilde ranges
            '>',           // Greater than
            '<',           // Less than
            '>=',          // Greater than or equal
            '<=',          // Less than or equal
            '||',          // OR operator
            ' - ',         // Range operator
            'latest',      // Special keywords
            'next',
            'beta',
            'alpha',
            'rc',
            'snapshot'
        ];
        
        // Check if version contains any invalid patterns
        const versionLower = version.toLowerCase();
        for (const pattern of invalidPatterns) {
            if (versionLower.includes(pattern)) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Fetch package metadata (maintainers, version history, etc.)
     * @param {string} system
     * @param {string} packageName
     * @param {string} version
     * @returns {Promise<Object>} Package metadata
     */
    async fetchPackageMetadata(system, packageName, version) {
        // Validate version string first
        if (!this.isValidSpecificVersion(version)) {
            console.log(`ℹ️  DepsDev: Skipping ${system}:${packageName}:${version} (version is a range/wildcard, not supported by API)`);
            return null;
        }
        
        const cacheKey = `metadata:${system}:${packageName}:${version}`;
        
        // Check cache first
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log(`📦 DepsDev: Using cached metadata for ${system}:${packageName}:${version}`);
                return cached.data;
            }
        }

        try {
            console.log(`🔍 DepsDev: Fetching metadata for ${system}:${packageName}:${version}`);
            
            const url = `${this.baseUrl}/systems/${encodeURIComponent(system)}/packages/${encodeURIComponent(packageName)}/versions/${encodeURIComponent(version)}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'SBOM-Play/1.0'
                }
            });

            if (!response.ok) {
                // 404 is normal - package/version doesn't exist in deps.dev
                if (response.status === 404) {
                    console.log(`ℹ️  DepsDev: No metadata found for ${system}:${packageName}:${version} (not in database)`);
                    return null;
                }
                
                // Other errors should be logged but not throw
                const errorText = await response.text();
                console.warn(`⚠️  DepsDev: API error for metadata ${system}:${packageName}:${version}: ${response.status} ${response.statusText}`);
                return null;
            }

            const data = await response.json();
            
            // Cache the result
            this.cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });

            console.log(`✅ DepsDev: Found metadata for ${system}:${packageName}:${version}`);
            return data;
        } catch (error) {
            console.warn(`⚠️  DepsDev: Failed to fetch metadata for ${system}:${packageName}:${version}:`, error.message);
            return null;
        }
    }

    /**
     * Fetch package information (general package data)
     * @param {string} system
     * @param {string} packageName
     * @returns {Promise<Object>} Package information
     */
    async fetchPackageInfo(system, packageName) {
        const cacheKey = `info:${system}:${packageName}`;
        
        // Check cache first
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log(`📦 DepsDev: Using cached package info for ${system}:${packageName}`);
                return cached.data;
            }
        }

        try {
            console.log(`🔍 DepsDev: Fetching package info for ${system}:${packageName}`);
            
            const url = `${this.baseUrl}/systems/${encodeURIComponent(system)}/packages/${encodeURIComponent(packageName)}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'SBOM-Play/1.0'
                }
            });

            if (!response.ok) {
                // 404 is normal - package doesn't exist in deps.dev
                if (response.status === 404) {
                    console.log(`ℹ️  DepsDev: No package info found for ${system}:${packageName} (not in database)`);
                    return null;
                }
                
                // Other errors should be logged but not throw
                const errorText = await response.text();
                console.warn(`⚠️  DepsDev: API error for package info ${system}:${packageName}: ${response.status} ${response.statusText}`);
                return null;
            }

            const data = await response.json();
            
            // Cache the result
            this.cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });

            console.log(`✅ DepsDev: Found package info for ${system}:${packageName}`);
            return data;
        } catch (error) {
            console.warn(`⚠️  DepsDev: Failed to fetch package info for ${system}:${packageName}:`, error.message);
            return null;
        }
    }

    /**
     * Detect ecosystem from package name or PURL
     * @param {string} packageName
     * @param {string} purl - Optional PURL for more accurate detection
     * @returns {string} Ecosystem name (npm, pypi, maven, etc.)
     */
    detectEcosystem(packageName, purl = null) {
        if (purl) {
            // Extract ecosystem from PURL
            const purlMatch = purl.match(/^pkg:([^\/]+)\//);
            if (purlMatch) {
                const purlEcosystem = purlMatch[1];
                
                // Skip unsupported ecosystems
                if (this.isUnsupportedEcosystem(purlEcosystem)) {
                    return null; // Return null for unsupported ecosystems
                }
                
                return this.mapPurlEcosystemToDepsDev(purlEcosystem);
            }
        }

        // Fallback to name-based detection
        const name = packageName.toLowerCase();
        
        // GitHub Actions pattern (owner/action-name)
        if (name.match(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/) && !name.includes('@')) {
            return null; // GitHub Actions are not supported by deps.dev
        }
        
        // NPM scoped packages (@scope/package)
        if (name.startsWith('@') && name.includes('/')) {
            return 'npm';
        }
        
        // Python packages (often contain hyphens, underscores)
        if (name.includes('-') || name.includes('_')) {
            // Could be npm or pypi, default to npm for now
            return 'npm';
        }
        
        return 'npm'; // Default fallback for unidentified packages
    }

    /**
     * Check if ecosystem is unsupported by deps.dev
     * @param {string} ecosystem
     * @returns {boolean} True if unsupported
     */
    isUnsupportedEcosystem(ecosystem) {
        const unsupportedEcosystems = [
            'github',      // GitHub Actions
            'generic',     // Generic packages
            'docker',      // Docker images
            'oci',         // OCI images
            'bitbucket',   // Bitbucket repositories
            'gitlab',      // GitLab repositories
            'git',         // Git repositories
            'swift',       // Swift packages (not supported by deps.dev yet)
            'cocoapods',   // CocoaPods (not supported by deps.dev yet)
            'conda',       // Conda packages (not supported by deps.dev yet)
            'cran',        // R packages (not supported by deps.dev yet)
            'hex',         // Erlang/Elixir packages (not supported by deps.dev yet)
            'pub',         // Dart packages (not supported by deps.dev yet)
        ];
        
        return unsupportedEcosystems.includes(ecosystem.toLowerCase());
    }

    /**
     * Map SBOM processor ecosystem names to deps.dev ecosystem names
     * @param {string} sbomEcosystem
     * @returns {string|null} DepsDev ecosystem or null if unsupported
     */
    mapSBOMEcosystemToDepsDev(sbomEcosystem) {
        const ecosystemMap = {
            'npm': 'npm',
            'PyPI': 'pypi',
            'Maven': 'maven',
            'NuGet': 'nuget',
            'Cargo': 'cargo',
            'Composer': 'packagist',
            'Go': 'go',
            'RubyGems': 'rubygems',
            // Unsupported ecosystems return null
            'GitHub Actions': null,
            'GitHub': null,
            'Docker': null,
            'Helm': null,
            'Terraform': null,
            'Unknown': null
        };
        
        return ecosystemMap[sbomEcosystem] || null;
    }

    /**
     * Map PURL ecosystem to deps.dev ecosystem
     * @param {string} purlEcosystem
     * @returns {string} DepsDev ecosystem
     */
    mapPurlEcosystemToDepsDev(purlEcosystem) {
        const ecosystemMap = {
            'npm': 'npm',
            'pypi': 'pypi',
            'maven': 'maven',
            'golang': 'go',
            'nuget': 'nuget',
            'cargo': 'cargo',
            'composer': 'composer',
            'hex': 'hex',
            'pub': 'pub'
        };
        
        return ecosystemMap[purlEcosystem] || 'npm';
    }

    /**
     * Clean version string by removing constraint operators
     * @param {string} version - Version string (may include ^, ~, >=, etc.)
     * @returns {string} Clean version number
     */
    cleanVersion(version) {
        if (!version) return version;
        
        // Remove common constraint operators
        // Examples: ^1.2.3 -> 1.2.3, ~1.2.3 -> 1.2.3, >=1.2.3 -> 1.2.3
        const cleaned = version.replace(/^[~^>=<]+\s*/, '').trim();
        
        console.log(`🧹 DepsDev: Cleaned version "${version}" -> "${cleaned}"`);
        return cleaned;
    }

    /**
     * Analyze dependencies with deps.dev enrichment
     * @param {Array} dependencies - Array of dependency objects
     * @param {Function} onProgress - Optional progress callback (progress, message)
     * @returns {Promise<Object>} Enriched dependency analysis
     */
    async analyzeDependencies(dependencies, onProgress = null) {
        console.log(`🔍 DepsDev: Analyzing ${dependencies.length} dependencies with deps.dev enrichment`);
        
        const enrichedDependencies = [];
        const skippedDependencies = [];
        const errors = [];
        
        for (let i = 0; i < dependencies.length; i++) {
            const dep = dependencies[i];
            
            // Update progress
            if (onProgress) {
                const progress = ((i + 1) / dependencies.length) * 100;
                onProgress(progress, `Enriching ${dep.name}@${dep.version}...`);
            }
            
            try {
                // Add delay to be respectful to the API
                if (i > 0) {
                    await this.sleep(this.rateLimitDelay);
                }
                
                // Clean version string (remove ^, ~, >=, etc.)
                const cleanVersion = this.cleanVersion(dep.version);
                
                // Use ecosystem from SBOM processor if available, otherwise detect it
                let ecosystem = dep.ecosystem;
                if (!ecosystem || ecosystem === 'Unknown') {
                    ecosystem = this.detectEcosystem(dep.name, dep.purl);
                } else {
                    // Map SBOM processor ecosystem names to deps.dev ecosystem names
                    ecosystem = this.mapSBOMEcosystemToDepsDev(ecosystem);
                }
                
                // Skip unsupported ecosystems
                if (ecosystem === null) {
                    console.log(`⏭️ DepsDev: Skipping unsupported package ${dep.name} (ecosystem: ${dep.ecosystem || 'unknown'})`);
                    skippedDependencies.push({
                        ...dep,
                        ecosystem: dep.ecosystem || 'unsupported',
                        depsDevTree: null,
                        depsDevMetadata: null,
                        hasTransitiveDependencies: false,
                        transitiveDependencyCount: 0,
                        skipped: true,
                        skipReason: 'Unsupported ecosystem'
                    });
                    continue;
                }
                
                // Fetch both dependency tree and metadata using CLEAN version
                const [treeData, metadata] = await Promise.all([
                    this.fetchDependencyTree(ecosystem, dep.name, cleanVersion).catch(err => {
                        console.warn(`⚠️ DepsDev: Could not fetch dependency tree for ${ecosystem}:${dep.name}:`, err.message);
                        return null;
                    }),
                    this.fetchPackageMetadata(ecosystem, dep.name, cleanVersion).catch(err => {
                        console.warn(`⚠️ DepsDev: Could not fetch metadata for ${ecosystem}:${dep.name}:`, err.message);
                        return null;
                    })
                ]);
                
                const enriched = {
                    ...dep,
                    ecosystem: ecosystem,
                    depsDevTree: treeData,
                    depsDevMetadata: metadata,
                    hasTransitiveDependencies: treeData && treeData.nodes && treeData.nodes.length > 1, // More than just the root node
                    transitiveDependencyCount: treeData && treeData.nodes ? treeData.nodes.length - 1 : 0 // Exclude the root node
                };
                
                enrichedDependencies.push(enriched);
                
            } catch (error) {
                console.error(`❌ DepsDev: Error enriching dependency ${dep.name}:`, error);
                errors.push({
                    dependency: dep.name,
                    error: error.message
                });
                
                // Add the original dependency without enrichment
                enrichedDependencies.push({
                    ...dep,
                    ecosystem: this.detectEcosystem(dep.name, dep.purl),
                    depsDevTree: null,
                    depsDevMetadata: null,
                    hasTransitiveDependencies: false,
                    transitiveDependencyCount: 0
                });
            }
        }
        
        const analysis = {
            totalDependencies: dependencies.length,
            enrichedDependencies: enrichedDependencies.length,
            skippedDependencies: skippedDependencies.length,
            enrichedDependenciesArray: enrichedDependencies, // Add the actual array
            skippedDependenciesArray: skippedDependencies, // Add the skipped array
            errors: errors,
            summary: {
                totalTransitiveDependencies: enrichedDependencies.reduce((sum, dep) => sum + dep.transitiveDependencyCount, 0),
                dependenciesWithTransitive: enrichedDependencies.filter(dep => dep.hasTransitiveDependencies).length,
                averageTransitiveDependencies: enrichedDependencies.length > 0 ? 
                    enrichedDependencies.reduce((sum, dep) => sum + dep.transitiveDependencyCount, 0) / enrichedDependencies.length : 0
            }
        };
        
        console.log(`✅ DepsDev: Analysis complete - ${analysis.enrichedDependencies} dependencies enriched, ${analysis.skippedDependencies} skipped`);
        return analysis;
    }

    /**
     * Get a summary of dependency insights
     * @param {Object} analysis - Result from analyzeDependencies
     * @returns {Object} Summary insights
     */
    getDependencyInsights(analysis) {
        const insights = {
            totalDirectDependencies: analysis.totalDependencies,
            totalTransitiveDependencies: analysis.summary.totalTransitiveDependencies,
            totalDependencies: analysis.totalDependencies + analysis.summary.totalTransitiveDependencies,
            dependenciesWithTransitive: analysis.summary.dependenciesWithTransitive,
            averageTransitiveDependencies: analysis.summary.averageTransitiveDependencies,
            errorCount: analysis.errors.length
        };
        
        // Calculate dependency bloat metrics
        insights.dependencyBloatRatio = insights.totalTransitiveDependencies / Math.max(insights.totalDirectDependencies, 1);
        insights.hasHighBloat = insights.dependencyBloatRatio > 10; // More than 10x transitive dependencies
        
        return insights;
    }

    /**
     * Clear the cache
     */
    clearCache() {
        this.cache.clear();
        console.log('🧹 DepsDev: Cache cleared');
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.entries()).map(([key, value]) => ({
                key: key,
                age: Date.now() - value.timestamp,
                dataSize: JSON.stringify(value.data).length
            }))
        };
    }

    /**
     * Sleep utility for rate limiting
     * @param {number} ms - Milliseconds to sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export as global for integration
window.DepsDevService = DepsDevService; 