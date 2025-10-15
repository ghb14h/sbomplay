/**
 * Ecosyste.ms API Service
 * Integrates with https://ecosyste.ms/api for package metadata across 63 ecosystems
 * 
 * Key Features:
 * - Package metadata with author/maintainer information
 * - Multi-ecosystem support (npm, PyPI, Maven, NuGet, Cargo, etc.)
 * - Polite pool access for better rate limits
 * - Comprehensive caching
 */
class EcosystemsService {
    constructor() {
        this.baseUrl = 'https://packages.ecosyste.ms/api/v1';
        this.cache = new Map();
        this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
        this.rateLimitDelay = 200; // ms between requests
        this.lastRequestTime = 0;
        
        // Email for polite pool access (better rate limits)
        this.politeEmail = 'sbomplay@cyfinoid.com';
        
        // Ecosystem mapping (ecosyste.ms name → our internal name)
        this.ecosystemMap = {
            'npm': 'npm',
            'pypi': 'pypi',
            'maven': 'maven',
            'nuget': 'nuget',
            'cargo': 'cargo',
            'packagist': 'composer',
            'go': 'go',
            'rubygems': 'rubygems',
            'hex': 'hex',
            'pub': 'pub'
        };
    }

    /**
     * Normalize ecosystem name for ecosyste.ms API
     */
    normalizeEcosystem(ecosystem) {
        const normalized = ecosystem?.toLowerCase();
        
        // Map our internal names to ecosyste.ms names
        const reverseMap = {
            'composer': 'packagist',
            'pypi': 'pypi',
            'npm': 'npm',
            'maven': 'maven',
            'nuget': 'nuget',
            'cargo': 'cargo',
            'go': 'go'
        };
        
        return reverseMap[normalized] || normalized;
    }

    /**
     * Wait for rate limiting
     */
    async waitForRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.rateLimitDelay) {
            const waitTime = this.rateLimitDelay - timeSinceLastRequest;
            await Utils.sleep(waitTime);
        }
        
        this.lastRequestTime = Date.now();
    }

    /**
     * Fetch package metadata from ecosyste.ms
     * @param {string} ecosystem - Package ecosystem (npm, pypi, maven, etc.)
     * @param {string} packageName - Package name
     * @returns {Promise<Object>} Package metadata including author info
     */
    async fetchPackageMetadata(ecosystem, packageName) {
        const normalizedEco = this.normalizeEcosystem(ecosystem);
        const cacheKey = `package:${normalizedEco}:${packageName}`;
        
        // Check cache
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                console.log(`📦 Ecosyste.ms: Using cached metadata for ${normalizedEco}:${packageName}`);
                return cached.data;
            }
        }

        try {
            await this.waitForRateLimit();
            
            console.log(`🔍 Ecosyste.ms: Fetching metadata for ${normalizedEco}:${packageName}`);
            
            // URL format: /registries/{registry}/packages/{package}
            const url = `${this.baseUrl}/registries/${encodeURIComponent(normalizedEco)}/packages/${encodeURIComponent(packageName)}?mailto=${this.politeEmail}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': `SBOM-Play/1.0 (${this.politeEmail})`
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    console.warn(`⚠️ Ecosyste.ms: Package not found: ${normalizedEco}:${packageName}`);
                    return null;
                }
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            // Cache the result
            this.cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });

            console.log(`✅ Ecosyste.ms: Found metadata for ${normalizedEco}:${packageName}`);
            return data;
        } catch (error) {
            console.error(`❌ Ecosyste.ms: Failed to fetch metadata for ${normalizedEco}:${packageName}:`, error);
            return null;
        }
    }

    /**
     * Extract author information from package metadata
     * @param {Object} metadata - Package metadata from ecosyste.ms
     * @returns {Object|null} Author information
     */
    extractAuthorInfo(metadata) {
        if (!metadata) return null;

        const authorInfo = {
            name: null,
            email: null,
            displayName: null,
            homepage: null,
            registry: metadata.registry || null,
            packageName: metadata.name || null
        };

        // Try to extract from different metadata formats
        
        // npm format
        if (metadata.metadata?.author) {
            if (typeof metadata.metadata.author === 'string') {
                authorInfo.name = metadata.metadata.author;
                authorInfo.displayName = metadata.metadata.author;
            } else if (typeof metadata.metadata.author === 'object') {
                authorInfo.name = metadata.metadata.author.name || metadata.metadata.author.username;
                authorInfo.email = metadata.metadata.author.email;
                authorInfo.displayName = metadata.metadata.author.name || metadata.metadata.author.username;
            }
        }

        // PyPI format
        if (metadata.metadata?.author_email) {
            authorInfo.email = metadata.metadata.author_email;
        }
        if (metadata.metadata?.author && !authorInfo.name) {
            authorInfo.name = metadata.metadata.author;
            authorInfo.displayName = metadata.metadata.author;
        }

        // Maven format
        if (metadata.metadata?.developers && Array.isArray(metadata.metadata.developers)) {
            const firstDev = metadata.metadata.developers[0];
            if (firstDev) {
                authorInfo.name = firstDev.id || firstDev.name;
                authorInfo.email = firstDev.email;
                authorInfo.displayName = firstDev.name || firstDev.id;
            }
        }

        // Maintainers (fallback)
        if (!authorInfo.name && metadata.metadata?.maintainers && Array.isArray(metadata.metadata.maintainers)) {
            const firstMaintainer = metadata.metadata.maintainers[0];
            if (firstMaintainer) {
                if (typeof firstMaintainer === 'string') {
                    authorInfo.name = firstMaintainer;
                    authorInfo.displayName = firstMaintainer;
                } else {
                    authorInfo.name = firstMaintainer.name || firstMaintainer.username;
                    authorInfo.email = firstMaintainer.email;
                    authorInfo.displayName = firstMaintainer.name || firstMaintainer.username;
                }
            }
        }

        // Homepage/repository
        if (metadata.homepage) {
            authorInfo.homepage = metadata.homepage;
        } else if (metadata.repository_url) {
            authorInfo.homepage = metadata.repository_url;
        }

        // Return null if no author found
        if (!authorInfo.name) {
            return null;
        }

        return authorInfo;
    }

    /**
     * Batch fetch package metadata for multiple packages
     * @param {Array} packages - Array of {ecosystem, name} objects
     * @param {Function} progressCallback - Optional callback(current, total)
     * @returns {Promise<Map>} Map of package key to metadata
     */
    async batchFetchPackageMetadata(packages, progressCallback = null) {
        const results = new Map();
        let processed = 0;

        for (const pkg of packages) {
            const metadata = await this.fetchPackageMetadata(pkg.ecosystem, pkg.name);
            const key = `${pkg.ecosystem}:${pkg.name}`;
            results.set(key, metadata);
            
            processed++;
            if (progressCallback) {
                progressCallback(processed, packages.length);
            }
        }

        return results;
    }

    /**
     * Search for packages across ecosystems
     * @param {string} query - Search query
     * @param {number} limit - Number of results (default: 20)
     * @returns {Promise<Array>} Search results
     */
    async searchPackages(query, limit = 20) {
        try {
            await this.waitForRateLimit();
            
            const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&per_page=${limit}&mailto=${this.politeEmail}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': `SBOM-Play/1.0 (${this.politeEmail})`
                }
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return data.results || [];
        } catch (error) {
            console.error('❌ Ecosyste.ms: Search failed:', error);
            return [];
        }
    }

    /**
     * Get package versions
     * @param {string} ecosystem - Package ecosystem
     * @param {string} packageName - Package name
     * @returns {Promise<Array>} Array of version objects
     */
    async fetchPackageVersions(ecosystem, packageName) {
        const normalizedEco = this.normalizeEcosystem(ecosystem);
        
        try {
            await this.waitForRateLimit();
            
            const url = `${this.baseUrl}/registries/${encodeURIComponent(normalizedEco)}/packages/${encodeURIComponent(packageName)}/versions?mailto=${this.politeEmail}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': `SBOM-Play/1.0 (${this.politeEmail})`
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return [];
                }
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return data || [];
        } catch (error) {
            console.error(`❌ Ecosyste.ms: Failed to fetch versions for ${normalizedEco}:${packageName}:`, error);
            return [];
        }
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        console.log('🗑️ Ecosyste.ms: Cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            timeout: this.cacheTimeout / 1000 / 60 + ' minutes'
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EcosystemsService;
}

