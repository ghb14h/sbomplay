/**
 * Author Analyzer - Extracts and analyzes package authors across all ecosystems
 * 
 * Features:
 * - Author extraction from multiple sources (SBOM, package registries, deps.dev, ecosyste.ms)
 * - Author:ecosystem uniqueness to prevent confusion (npm:john !== pypi:john)
 * - Direct vs transitive dependency tracking
 * - Comprehensive statistics and ranking
 */
class AuthorAnalyzer {
    constructor(ecosystemsService, depsDevService, storageManager) {
        this.ecosystemsService = ecosystemsService;
        this.depsDevService = depsDevService;
        this.storageManager = storageManager;
        
        // Author data cache: Map<authorId, authorData>
        this.authorCache = new Map();
    }

    /**
     * Generate unique author ID: author:ecosystem
     * This ensures npm:john is different from pypi:john
     */
    generateAuthorId(authorName, ecosystem) {
        if (!authorName || !ecosystem) return null;
        const cleanAuthor = authorName.toLowerCase().trim();
        const cleanEco = ecosystem.toLowerCase().trim();
        return `${cleanAuthor}:${cleanEco}`;
    }

    /**
     * Analyze authors from dependency data
     * @param {Array} dependencies - All dependencies
     * @param {Object} transitiveData - Transitive dependency data (optional)
     * @param {String} contextId - Organization or repo name
     * @returns {Promise<Array>} Array of author analysis data
     */
    async analyzeAuthors(dependencies, transitiveData = null, contextId = null) {
        console.log(`🔍 Author Analysis: Starting for ${dependencies.length} dependencies...`);
        
        const authorMap = new Map(); // Map<authorId, authorData>
        let processed = 0;
        const total = dependencies.length;

        // Process each dependency
        for (const dep of dependencies) {
            try {
                processed++;
                if (processed % 10 === 0) {
                    console.log(`📦 Author Analysis: Processed ${processed}/${total} packages...`);
                }

                const authorInfo = await this.extractAuthorInfo(dep);
                
                if (!authorInfo) {
                    console.log(`⚠️ No author found for ${dep.ecosystem}:${dep.name}`);
                    continue;
                }

                const authorId = this.generateAuthorId(authorInfo.name, dep.ecosystem);
                if (!authorId) continue;

                // Get or create author entry
                if (!authorMap.has(authorId)) {
                    authorMap.set(authorId, {
                        authorId: authorId,
                        author: authorInfo.name,
                        ecosystem: dep.ecosystem,
                        displayName: authorInfo.displayName || authorInfo.name,
                        email: authorInfo.email || null,
                        packages: [],
                        packageCount: 0,
                        directCount: 0,
                        transitiveCount: 0,
                        percentage: 0,
                        links: this.generateAuthorLinks(authorInfo.name, dep.ecosystem, authorInfo.homepage)
                    });
                }

                const authorData = authorMap.get(authorId);

                // Add package to author's list
                const packageEntry = {
                    name: dep.name,
                    version: dep.version,
                    isDirect: dep.isDirect !== false, // Assume direct unless specified
                    ecosystem: dep.ecosystem,
                    repoName: dep.repositoryName || contextId
                };

                // Check if package already added (avoid duplicates)
                const existingPkg = authorData.packages.find(p => 
                    p.name === packageEntry.name && p.ecosystem === packageEntry.ecosystem
                );

                if (!existingPkg) {
                    authorData.packages.push(packageEntry);
                    authorData.packageCount++;
                    
                    if (packageEntry.isDirect) {
                        authorData.directCount++;
                    } else {
                        authorData.transitiveCount++;
                    }
                }

            } catch (error) {
                console.error(`❌ Error processing ${dep.name}:`, error);
            }
        }

        // Calculate percentages
        const totalPackages = dependencies.length;
        for (const [authorId, authorData] of authorMap) {
            authorData.percentage = ((authorData.packageCount / totalPackages) * 100).toFixed(2);
        }

        // Convert to array and sort by package count
        const authorsArray = Array.from(authorMap.values());
        authorsArray.sort((a, b) => b.packageCount - a.packageCount);

        console.log(`✅ Author Analysis: Found ${authorsArray.length} unique authors`);
        
        // Save to storage if contextId provided
        if (contextId && this.storageManager) {
            try {
                await this.storageManager.saveAuthorAnalysis(contextId, authorsArray);
                console.log(`💾 Author Analysis: Saved to storage`);
            } catch (error) {
                console.error(`❌ Failed to save author analysis:`, error);
            }
        }

        return authorsArray;
    }

    /**
     * Extract author info from multiple sources with priority
     * Priority: SBOM metadata > ecosyste.ms > deps.dev > package registry
     */
    async extractAuthorInfo(dependency) {
        // 1. Check SBOM metadata first (fastest, already available)
        if (dependency.author || dependency.maintainer) {
            return {
                name: dependency.author || dependency.maintainer,
                displayName: dependency.authorDisplayName || dependency.author || dependency.maintainer,
                email: dependency.authorEmail || null,
                homepage: dependency.homepage || null,
                source: 'sbom'
            };
        }

        // 2. Try ecosyste.ms (comprehensive, supports 63 ecosystems)
        if (this.ecosystemsService) {
            try {
                const metadata = await this.ecosystemsService.fetchPackageMetadata(
                    dependency.ecosystem,
                    dependency.name
                );
                
                if (metadata) {
                    const authorInfo = this.ecosystemsService.extractAuthorInfo(metadata);
                    if (authorInfo && authorInfo.name) {
                        return {
                            ...authorInfo,
                            source: 'ecosyste.ms'
                        };
                    }
                }
            } catch (error) {
                console.warn(`⚠️ Ecosyste.ms lookup failed for ${dependency.name}:`, error.message);
            }
        }

        // 3. Try deps.dev (good for transitive dependencies)
        if (this.depsDevService && dependency.version) {
            try {
                const metadata = await this.depsDevService.fetchPackageMetadata(
                    dependency.ecosystem,
                    dependency.name,
                    dependency.version
                );
                
                if (metadata && metadata.version) {
                    // deps.dev doesn't directly provide author, but has publishedAt which could indicate publisher
                    // We'll skip this for now unless we find a way to extract author
                }
            } catch (error) {
                console.warn(`⚠️ Deps.dev lookup failed for ${dependency.name}:`, error.message);
            }
        }

        // 4. Try ecosystem-specific registries (last resort)
        const registryAuthor = await this.fetchFromRegistry(dependency);
        if (registryAuthor) {
            return {
                ...registryAuthor,
                source: 'registry'
            };
        }

        // No author found
        return null;
    }

    /**
     * Fetch author from ecosystem-specific registries
     * @param {Object} dependency
     * @returns {Promise<Object|null>}
     */
    async fetchFromRegistry(dependency) {
        const ecosystem = dependency.ecosystem?.toLowerCase();
        
        // npm registry
        if (ecosystem === 'npm') {
            return await this.fetchFromNpmRegistry(dependency.name);
        }
        
        // PyPI registry
        if (ecosystem === 'pypi') {
            return await this.fetchFromPyPIRegistry(dependency.name);
        }
        
        // Add more registries as needed
        return null;
    }

    /**
     * Fetch from npm registry
     */
    async fetchFromNpmRegistry(packageName) {
        try {
            const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
            const response = await fetch(url);
            
            if (!response.ok) return null;
            
            const data = await response.json();
            const latest = data['dist-tags']?.latest;
            const versionData = data.versions?.[latest];
            
            if (versionData?.author) {
                const author = versionData.author;
                return {
                    name: typeof author === 'string' ? author : (author.name || author.username),
                    email: typeof author === 'object' ? author.email : null,
                    displayName: typeof author === 'string' ? author : author.name,
                    homepage: versionData.homepage || data.homepage
                };
            }
        } catch (error) {
            console.warn(`⚠️ npm registry lookup failed for ${packageName}`);
        }
        return null;
    }

    /**
     * Fetch from PyPI registry
     */
    async fetchFromPyPIRegistry(packageName) {
        try {
            const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;
            const response = await fetch(url);
            
            if (!response.ok) return null;
            
            const data = await response.json();
            const info = data.info;
            
            if (info?.author) {
                return {
                    name: info.author,
                    email: info.author_email || null,
                    displayName: info.author,
                    homepage: info.home_page || info.package_url
                };
            }
        } catch (error) {
            console.warn(`⚠️ PyPI registry lookup failed for ${packageName}`);
        }
        return null;
    }

    /**
     * Generate author profile links
     * @param {string} authorName
     * @param {string} ecosystem
     * @param {string} homepage
     * @returns {Object} Links object
     */
    generateAuthorLinks(authorName, ecosystem, homepage = null) {
        const links = {};
        const cleanName = encodeURIComponent(authorName);
        
        // Ecosystem-specific links
        switch (ecosystem?.toLowerCase()) {
            case 'npm':
                links.npm = `https://www.npmjs.com/~${cleanName}`;
                links.registry = links.npm;
                break;
            case 'pypi':
                links.pypi = `https://pypi.org/user/${cleanName}/`;
                links.registry = links.pypi;
                break;
            case 'maven':
                // Maven doesn't have user profiles, use search
                links.maven = `https://search.maven.org/search?q=${cleanName}`;
                links.registry = links.maven;
                break;
            case 'nuget':
                links.nuget = `https://www.nuget.org/profiles/${cleanName}`;
                links.registry = links.nuget;
                break;
            case 'cargo':
                links.cargo = `https://crates.io/users/${cleanName}`;
                links.registry = links.cargo;
                break;
            case 'composer':
                links.packagist = `https://packagist.org/users/${cleanName}/`;
                links.registry = links.packagist;
                break;
            case 'rubygems':
                links.rubygems = `https://rubygems.org/profiles/${cleanName}`;
                links.registry = links.rubygems;
                break;
        }

        // GitHub (guess - might not be accurate)
        links.githubSearch = `https://github.com/${cleanName}`;
        
        // Homepage if provided
        if (homepage) {
            links.homepage = homepage;
        }

        return links;
    }

    /**
     * Get top N authors
     * @param {Array} authorsArray
     * @param {number} limit
     * @returns {Array}
     */
    getTopAuthors(authorsArray, limit = 20) {
        return authorsArray.slice(0, limit);
    }

    /**
     * Filter authors by ecosystem
     * @param {Array} authorsArray
     * @param {string} ecosystem
     * @returns {Array}
     */
    filterByEcosystem(authorsArray, ecosystem) {
        return authorsArray.filter(author => 
            author.ecosystem.toLowerCase() === ecosystem.toLowerCase()
        );
    }

    /**
     * Search authors by name
     * @param {Array} authorsArray
     * @param {string} query
     * @returns {Array}
     */
    searchAuthors(authorsArray, query) {
        const lowerQuery = query.toLowerCase();
        return authorsArray.filter(author =>
            author.author.toLowerCase().includes(lowerQuery) ||
            (author.displayName && author.displayName.toLowerCase().includes(lowerQuery))
        );
    }

    /**
     * Get ecosystem distribution
     * @param {Array} authorsArray
     * @returns {Object}
     */
    getEcosystemDistribution(authorsArray) {
        const distribution = {};
        
        for (const author of authorsArray) {
            const eco = author.ecosystem;
            if (!distribution[eco]) {
                distribution[eco] = {
                    count: 0,
                    packages: 0
                };
            }
            distribution[eco].count++;
            distribution[eco].packages += author.packageCount;
        }
        
        return distribution;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthorAnalyzer;
}

