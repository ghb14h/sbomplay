/**
 * Storage Manager - IndexedDB-based storage for SBOM Play
 * Provides unlimited storage capacity compared to localStorage's 5MB limit
 */
class StorageManager {
    constructor() {
        this.dbName = 'SBOMPlayDB';
        this.dbVersion = 3; // Incremented for single repo analyses store
        this.db = null;
        this.maxHistoryEntries = 100; // Increased from 20 since IndexedDB has no strict limit
        this.maxOrganizations = 50; // Increased from 10
        
        // Store names
        this.stores = {
            organizations: 'organizations',
            history: 'history',
            vulnerabilities: 'vulnerabilities',
            settings: 'settings',
            authorAnalysis: 'authorAnalysis', // Author analysis data
            singleRepoAnalyses: 'singleRepoAnalyses' // Single repository analyses
        };
    }

    /**
     * Initialize the IndexedDB database
     */
    async init() {
        if (this.db) {
            return this.db;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('❌ Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB initialized successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Organizations store
                if (!db.objectStoreNames.contains(this.stores.organizations)) {
                    const orgStore = db.createObjectStore(this.stores.organizations, { keyPath: 'organization' });
                    orgStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // History store
                if (!db.objectStoreNames.contains(this.stores.history)) {
                    const historyStore = db.createObjectStore(this.stores.history, { keyPath: 'id', autoIncrement: true });
                    historyStore.createIndex('organization', 'organization', { unique: false });
                    historyStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // Vulnerabilities store
                if (!db.objectStoreNames.contains(this.stores.vulnerabilities)) {
                    const vulnStore = db.createObjectStore(this.stores.vulnerabilities, { keyPath: 'packageKey' });
                    vulnStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // Settings store
                if (!db.objectStoreNames.contains(this.stores.settings)) {
                    db.createObjectStore(this.stores.settings, { keyPath: 'key' });
                }

                // Author Analysis store
                if (!db.objectStoreNames.contains(this.stores.authorAnalysis)) {
                    const authorStore = db.createObjectStore(this.stores.authorAnalysis, { keyPath: 'contextId' });
                    authorStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // Single Repository Analyses store
                if (!db.objectStoreNames.contains(this.stores.singleRepoAnalyses)) {
                    const singleRepoStore = db.createObjectStore(this.stores.singleRepoAnalyses, { 
                        keyPath: 'repoKey' // Format: "owner/name"
                    });
                    singleRepoStore.createIndex('owner', 'owner', { unique: false });
                    singleRepoStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                console.log('🔧 IndexedDB schema created');
            };
        });
    }

    /**
     * Get a transaction for a store
     */
    getTransaction(storeName, mode = 'readonly') {
        if (!this.db) {
            throw new Error('Database not initialized. Call init() first.');
        }
        return this.db.transaction([storeName], mode);
    }

    /**
     * Save analysis data to IndexedDB
     */
    async saveAnalysisData(orgName, data) {
        try {
            await this.init();
            const timestamp = new Date().toISOString();
            const analysisData = {
                organization: orgName,
                timestamp: timestamp,
                data: data
            };

            console.log(`📊 Saving analysis data for ${orgName} to IndexedDB`);

            // Save to organizations store
            const transaction = this.getTransaction(this.stores.organizations, 'readwrite');
            const store = transaction.objectStore(this.stores.organizations);
            
            await new Promise((resolve, reject) => {
                const request = store.put(analysisData);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            // Add to history
            await this.addToHistory(orgName, timestamp, data);

            // Cleanup old data if needed
            await this.cleanupOldData();

            console.log('✅ Analysis data saved to IndexedDB');
            return true;
        } catch (error) {
            console.error('❌ Failed to save data:', error);
            alert('Failed to save analysis data. Please try again.');
            return false;
        }
    }

    /**
     * Load the most recent analysis data
     */
    async loadAnalysisData() {
        try {
            await this.init();
            const organizations = await this.getOrganizations();
            
            if (organizations.length > 0) {
                // Return the most recent organization data
                const mostRecent = organizations[organizations.length - 1];
                const fullData = await this.getFullOrganizationData(mostRecent.organization);
                return fullData;
            }
            
            return null;
        } catch (error) {
            console.error('❌ Failed to load data:', error);
            return null;
        }
    }

    /**
     * Load analysis data for a specific organization
     */
    async loadAnalysisDataForOrganization(orgName) {
        try {
            await this.init();
            const fullData = await this.getFullOrganizationData(orgName);
            return fullData;
        } catch (error) {
            console.error('❌ Failed to load organization data:', error);
            return null;
        }
    }

    /**
     * Get list of all organizations (summary only)
     */
    async getOrganizations() {
        try {
            await this.init();
            const transaction = this.getTransaction(this.stores.organizations);
            const store = transaction.objectStore(this.stores.organizations);
            
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    const organizations = request.result.map(org => ({
                        organization: org.organization,
                        timestamp: org.timestamp,
                        summary: {
                            totalRepositories: org.data?.statistics?.totalRepositories || 0,
                            totalDependencies: org.data?.statistics?.totalDependencies || 0,
                            uniqueDependencies: org.data?.statistics?.uniqueDependencies || 0
                        }
                    }));
                    resolve(organizations);
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('❌ Failed to get organizations:', error);
            return [];
        }
    }

    /**
     * Get full organization data including all details
     */
    async getFullOrganizationData(orgName) {
        try {
            await this.init();
            const transaction = this.getTransaction(this.stores.organizations);
            const store = transaction.objectStore(this.stores.organizations);
            
            return new Promise((resolve, reject) => {
                const request = store.get(orgName);
                request.onsuccess = () => {
                    const data = request.result;
                    if (data && data.data) {
                        resolve({
                            ...data.data,
                            organization: data.organization,
                            timestamp: data.timestamp
                        });
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('❌ Failed to get full organization data:', error);
            return null;
        }
    }

    /**
     * Remove organization data
     */
    async removeOrganizationData(orgName) {
        try {
            await this.init();
            const transaction = this.getTransaction(this.stores.organizations, 'readwrite');
            const store = transaction.objectStore(this.stores.organizations);
            
            await new Promise((resolve, reject) => {
                const request = store.delete(orgName);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            console.log(`✅ Removed data for ${orgName}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to remove organization data:', error);
            return false;
        }
    }

    /**
     * Add to history
     */
    async addToHistory(orgName, timestamp, data) {
        try {
            await this.init();
            const historyEntry = {
                organization: orgName,
                timestamp: timestamp,
                summary: {
                    totalRepositories: data?.statistics?.totalRepositories || 0,
                    totalDependencies: data?.statistics?.totalDependencies || 0,
                    uniqueDependencies: data?.statistics?.uniqueDependencies || 0
                }
            };

            const transaction = this.getTransaction(this.stores.history, 'readwrite');
            const store = transaction.objectStore(this.stores.history);
            
            await new Promise((resolve, reject) => {
                const request = store.add(historyEntry);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            // Cleanup old history entries
            await this.cleanupHistory();
        } catch (error) {
            console.error('❌ Failed to add to history:', error);
        }
    }

    /**
     * Get history
     */
    async getHistory() {
        try {
            await this.init();
            const transaction = this.getTransaction(this.stores.history);
            const store = transaction.objectStore(this.stores.history);
            const index = store.index('timestamp');
            
            return new Promise((resolve, reject) => {
                const request = index.openCursor(null, 'prev'); // Sort by timestamp descending
                const history = [];
                
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor && history.length < this.maxHistoryEntries) {
                        history.push(cursor.value);
                        cursor.continue();
                    } else {
                        resolve(history);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('❌ Failed to get history:', error);
            return [];
        }
    }

    /**
     * Cleanup old history entries
     */
    async cleanupHistory() {
        try {
            const history = await this.getHistory();
            if (history.length > this.maxHistoryEntries) {
                const transaction = this.getTransaction(this.stores.history, 'readwrite');
                const store = transaction.objectStore(this.stores.history);
                
                // Remove oldest entries
                const toRemove = history.slice(this.maxHistoryEntries);
                for (const entry of toRemove) {
                    store.delete(entry.id);
                }
                console.log(`🗑️ Removed ${toRemove.length} old history entries`);
            }
        } catch (error) {
            console.error('❌ Failed to cleanup history:', error);
        }
    }

    /**
     * Cleanup old data
     */
    async cleanupOldData() {
        try {
            const organizations = await this.getOrganizations();
            if (organizations.length > this.maxOrganizations) {
                // Sort by timestamp and remove oldest
                organizations.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                const toRemove = organizations.slice(0, organizations.length - this.maxOrganizations);
                
                for (const org of toRemove) {
                    await this.removeOrganizationData(org.organization);
                }
                console.log(`🗑️ Removed ${toRemove.length} oldest organizations`);
            }
        } catch (error) {
            console.error('❌ Failed to cleanup old data:', error);
        }
    }

    /**
     * Clear all data
     */
    async clearAllData() {
        try {
            await this.init();
            const stores = [
                this.stores.organizations,
                this.stores.history,
                this.stores.vulnerabilities,
                this.stores.settings
            ];

            for (const storeName of stores) {
                const transaction = this.getTransaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);
                await new Promise((resolve, reject) => {
                    const request = store.clear();
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }

            // Also clear localStorage theme preference (keep this in localStorage)
            // localStorage.removeItem('sbomplay-theme'); // Keep theme setting

            console.log('✅ All data cleared from IndexedDB');
            return true;
        } catch (error) {
            console.error('❌ Failed to clear data:', error);
            return false;
        }
    }

    /**
     * Export data to JSON file
     */
    exportData(data, filename = 'sbom-analysis.json') {
        try {
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            console.log('✅ Data exported successfully');
        } catch (error) {
            console.error('❌ Failed to export data:', error);
            alert('Failed to export data');
        }
    }

    /**
     * Export all data
     */
    async exportAllData(filename = 'sbom-all-analyses.json') {
        try {
            await this.init();
            const organizations = await this.getOrganizations();
            const allData = [];

            for (const org of organizations) {
                const fullData = await this.getFullOrganizationData(org.organization);
                if (fullData) {
                    allData.push({
                        organization: org.organization,
                        timestamp: org.timestamp,
                        data: fullData
                    });
                }
            }

            this.exportData(allData, filename);
        } catch (error) {
            console.error('❌ Failed to export all data:', error);
            alert('Failed to export all data');
        }
    }

    /**
     * Get storage info and statistics
     */
    async getStorageInfo() {
        try {
            await this.init();
            const organizations = await this.getOrganizations();
            const history = await this.getHistory();
            const vulnKeys = await this.getAllVulnerabilityKeys();

            // Estimate storage usage (IndexedDB doesn't have a direct API for this)
            let estimatedSize = 0;
            for (const org of organizations) {
                const fullData = await this.getFullOrganizationData(org.organization);
                estimatedSize += JSON.stringify(fullData).length;
            }

            return {
                organizationsCount: organizations.length,
                historyCount: history.length,
                vulnerabilitiesCount: vulnKeys.length,
                estimatedSize: estimatedSize,
                estimatedSizeMB: (estimatedSize / 1024 / 1024).toFixed(2),
                organizations: organizations
            };
        } catch (error) {
            console.error('❌ Failed to get storage info:', error);
            return {
                organizationsCount: 0,
                historyCount: 0,
                vulnerabilitiesCount: 0,
                estimatedSize: 0,
                estimatedSizeMB: '0.00',
                organizations: []
            };
        }
    }

    /**
     * Check if IndexedDB is available
     */
    isStorageAvailable() {
        try {
            return 'indexedDB' in window && indexedDB !== null;
        } catch (e) {
            return false;
        }
    }

    /**
     * Save vulnerability data
     */
    async saveVulnerabilityData(packageKey, vulnerabilityData) {
        try {
            await this.init();
            const vulnEntry = {
                packageKey: packageKey,
                data: vulnerabilityData,
                timestamp: Date.now()
            };

            const transaction = this.getTransaction(this.stores.vulnerabilities, 'readwrite');
            const store = transaction.objectStore(this.stores.vulnerabilities);
            
            await new Promise((resolve, reject) => {
                const request = store.put(vulnEntry);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            return true;
        } catch (error) {
            console.error('❌ Failed to save vulnerability data:', error);
            return false;
        }
    }

    /**
     * Get all vulnerability data
     */
    async getVulnerabilityData() {
        try {
            await this.init();
            const transaction = this.getTransaction(this.stores.vulnerabilities);
            const store = transaction.objectStore(this.stores.vulnerabilities);
            
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    const vulnData = {};
                    for (const item of request.result) {
                        vulnData[item.packageKey] = {
                            data: item.data,
                            timestamp: item.timestamp
                        };
                    }
                    resolve(vulnData);
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('❌ Failed to get vulnerability data:', error);
            return {};
        }
    }

    /**
     * Get vulnerability data for specific package
     */
    async getVulnerabilityDataForPackage(packageKey) {
        try {
            await this.init();
            const transaction = this.getTransaction(this.stores.vulnerabilities);
            const store = transaction.objectStore(this.stores.vulnerabilities);
            
            return new Promise((resolve, reject) => {
                const request = store.get(packageKey);
                request.onsuccess = () => {
                    const item = request.result;
                    if (item) {
                        resolve({
                            data: item.data,
                            timestamp: item.timestamp
                        });
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('❌ Failed to get vulnerability data for package:', error);
            return null;
        }
    }

    /**
     * Check if vulnerability data exists for package
     */
    async hasVulnerabilityData(packageKey) {
        try {
            const data = await this.getVulnerabilityDataForPackage(packageKey);
            return data !== null;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get all vulnerability package keys
     */
    async getAllVulnerabilityKeys() {
        try {
            await this.init();
            const transaction = this.getTransaction(this.stores.vulnerabilities);
            const store = transaction.objectStore(this.stores.vulnerabilities);
            
            return new Promise((resolve, reject) => {
                const request = store.getAllKeys();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('❌ Failed to get vulnerability keys:', error);
            return [];
        }
    }

    /**
     * Clear vulnerability data
     */
    async clearVulnerabilityData() {
        try {
            await this.init();
            const transaction = this.getTransaction(this.stores.vulnerabilities, 'readwrite');
            const store = transaction.objectStore(this.stores.vulnerabilities);
            
            await new Promise((resolve, reject) => {
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            console.log('✅ Vulnerability data cleared');
            return true;
        } catch (error) {
            console.error('❌ Failed to clear vulnerability data:', error);
            return false;
        }
    }

    /**
     * Cleanup old vulnerability data (older than 30 days)
     */
    async cleanupOldVulnerabilityData() {
        try {
            await this.init();
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            const transaction = this.getTransaction(this.stores.vulnerabilities, 'readwrite');
            const store = transaction.objectStore(this.stores.vulnerabilities);
            const index = store.index('timestamp');
            
            return new Promise((resolve, reject) => {
                const request = index.openCursor(IDBKeyRange.upperBound(thirtyDaysAgo));
                let cleanedCount = 0;
                
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        cursor.delete();
                        cleanedCount++;
                        cursor.continue();
                    } else {
                        console.log(`🧹 Cleaned up ${cleanedCount} old vulnerability entries`);
                        resolve(cleanedCount);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('❌ Failed to cleanup old vulnerability data:', error);
            return 0;
        }
    }

    /**
     * Save incremental analysis data
     */
    async saveIncrementalAnalysisData(orgName, partialData, isComplete = false) {
        try {
            await this.init();
            const existingData = await this.getFullOrganizationData(orgName);
            
            let mergedData;
            if (existingData && existingData.data) {
                mergedData = this.mergeAnalysisData(existingData.data, partialData);
            } else {
                mergedData = partialData;
            }

            return await this.saveAnalysisData(orgName, mergedData);
        } catch (error) {
            console.error('❌ Failed to save incremental data:', error);
            return false;
        }
    }

    /**
     * Merge analysis data
     */
    mergeAnalysisData(existingData, newData) {
        const merged = JSON.parse(JSON.stringify(existingData));

        // Merge statistics
        if (newData.statistics) {
            merged.statistics = { ...merged.statistics, ...newData.statistics };
        }

        // Merge dependencies
        if (newData.allDependencies) {
            if (!merged.allDependencies) {
                merged.allDependencies = [];
            }
            const existingDeps = new Map(merged.allDependencies.map(d => [`${d.name}@${d.version}`, d]));
            for (const dep of newData.allDependencies) {
                const key = `${dep.name}@${dep.version}`;
                if (!existingDeps.has(key)) {
                    merged.allDependencies.push(dep);
                }
            }
        }

        // Merge repositories
        if (newData.allRepositories) {
            if (!merged.allRepositories) {
                merged.allRepositories = [];
            }
            const existingRepos = new Map(merged.allRepositories.map(r => [r.name, r]));
            for (const repo of newData.allRepositories) {
                if (!existingRepos.has(repo.name)) {
                    merged.allRepositories.push(repo);
                }
            }
        }

        // Merge other data
        if (newData.topDependencies) merged.topDependencies = newData.topDependencies;
        if (newData.topRepositories) merged.topRepositories = newData.topRepositories;
        if (newData.categoryStats) merged.categoryStats = newData.categoryStats;
        if (newData.languageStats) merged.languageStats = newData.languageStats;
        if (newData.vulnerabilityAnalysis) merged.vulnerabilityAnalysis = newData.vulnerabilityAnalysis;
        if (newData.licenseAnalysis) merged.licenseAnalysis = newData.licenseAnalysis;

        return merged;
    }

    /**
     * Update analysis with vulnerabilities
     */
    async updateAnalysisWithVulnerabilities(orgName, vulnerabilityData) {
        try {
            await this.init();
            const existingData = await this.getFullOrganizationData(orgName);
            if (!existingData) {
                console.error('❌ No existing data for organization:', orgName);
                return false;
            }

            existingData.vulnerabilityAnalysis = vulnerabilityData;
            return await this.saveAnalysisData(orgName, existingData);
        } catch (error) {
            console.error('❌ Failed to update with vulnerabilities:', error);
            return false;
        }
    }

    /**
     * Get combined data from all organizations
     */
    async getCombinedData() {
        try {
            await this.init();
            const organizations = await this.getOrganizations();
            if (organizations.length === 0) {
                return null;
            }

            const allData = [];
            for (const org of organizations) {
                const orgData = await this.getFullOrganizationData(org.organization);
                if (orgData) {
                    // Wrap orgData in data property for combineOrganizationData
                    allData.push({ data: orgData });
                }
            }

            if (allData.length === 0) {
                return null;
            }

            const combined = this.combineOrganizationData(allData);
            // Wrap in data property to match dashboard expectations
            return { data: combined };
        } catch (error) {
            console.error('❌ Failed to get combined data:', error);
            return null;
        }
    }

    /**
     * Combine data from multiple organizations
     */
    combineOrganizationData(organizationsData) {
        // Implementation remains the same as it's pure data transformation
        // This is a large method, keeping the logic intact
        const combined = {
            statistics: {
                totalRepositories: 0,
                repositoriesWithDependencies: 0,
                repositoriesWithoutDependencies: 0,
                totalDependencies: 0,
                uniqueDependencies: 0
            },
            allDependencies: [],
            allRepositories: [],
            topDependencies: [],
            topRepositories: [],
            categoryStats: {},
            languageStats: {}
        };

        // Aggregate statistics
        for (const orgData of organizationsData) {
            if (orgData.data && orgData.data.statistics) {
                combined.statistics.totalRepositories += orgData.data.statistics.totalRepositories || 0;
                combined.statistics.repositoriesWithDependencies += orgData.data.statistics.repositoriesWithDependencies || 0;
                combined.statistics.repositoriesWithoutDependencies += orgData.data.statistics.repositoriesWithoutDependencies || 0;
                combined.statistics.totalDependencies += orgData.data.statistics.totalDependencies || 0;
            }
        }

        // Combine dependencies
        const dependencyMap = new Map();
        const repoMap = new Map();

        for (const orgData of organizationsData) {
            if (!orgData.data) continue;

            if (orgData.data.allDependencies) {
                for (const dep of orgData.data.allDependencies) {
                    const key = `${dep.name}@${dep.version}`;
                    if (dependencyMap.has(key)) {
                        const existing = dependencyMap.get(key);
                        existing.repositories = [...new Set([...existing.repositories, ...dep.repositories])];
                    } else {
                        dependencyMap.set(key, { ...dep });
                    }
                }
            }

            if (orgData.data.allRepositories) {
                for (const repo of orgData.data.allRepositories) {
                    const repoKey = repo.name;
                    if (!repoMap.has(repoKey)) {
                        repoMap.set(repoKey, repo);
                    }
                }
            }
        }

        combined.allDependencies = Array.from(dependencyMap.values());
        combined.allRepositories = Array.from(repoMap.values());
        combined.statistics.uniqueDependencies = combined.allDependencies.length;

        // Sort and get top dependencies
        combined.topDependencies = combined.allDependencies
            .sort((a, b) => b.repositories.length - a.repositories.length)
            .slice(0, 20);

        // Sort and get top repositories
        combined.topRepositories = combined.allRepositories
            .sort((a, b) => (b.dependencyCount || 0) - (a.dependencyCount || 0))
            .slice(0, 20);

        return combined;
    }

    /**
     * Legacy method - no compression needed with IndexedDB
     */
    compressData(data) {
        return data;
    }

    /**
     * Legacy method - no decompression needed with IndexedDB
     */
    decompressData(data) {
        return data;
    }

    /**
     * Legacy method - IndexedDB has much larger capacity
     */
    hasEnoughStorage(dataSize) {
        return true;
    }

    /**
     * Legacy method - estimate current usage
     */
    async getCurrentStorageUsage() {
        const info = await this.getStorageInfo();
        return info.estimatedSize;
    }

    /**
     * Get storage recommendations
     */
    async getStorageRecommendations() {
        const storageInfo = await this.getStorageInfo();
        const recommendations = [];

        // IndexedDB has much larger capacity, so recommendations are more lenient
        if (storageInfo.organizationsCount > this.maxOrganizations * 0.9) {
            recommendations.push({
                type: 'warning',
                message: `You have ${storageInfo.organizationsCount} organizations stored. Consider exporting and removing old analyses.`
            });
        }

        if (storageInfo.historyCount > this.maxHistoryEntries * 0.9) {
            recommendations.push({
                type: 'info',
                message: `History has ${storageInfo.historyCount} entries. Old entries will be automatically cleaned up.`
            });
        }

        return recommendations;
    }

    /**
     * Check data size and warn if storage is getting full
     */
    async checkDataSizeAndWarn(contextName = 'analysis') {
        try {
            const info = await this.getStorageInfo();
            const usagePercent = info.usage && info.quota 
                ? (info.usage / info.quota * 100)
                : 0;
            
            if (usagePercent > 90) {
                console.warn(`⚠️ Storage ${usagePercent.toFixed(1)}% full for ${contextName}`);
                return {
                    warning: true,
                    usage: info.usage,
                    quota: info.quota,
                    percentUsed: usagePercent.toFixed(1),
                    message: `Storage is ${usagePercent.toFixed(1)}% full. Consider clearing old data.`
                };
            }
            
            if (usagePercent > 75) {
                console.log(`ℹ️ Storage ${usagePercent.toFixed(1)}% used for ${contextName}`);
            }
            
            return { warning: false, percentUsed: usagePercent.toFixed(1) };
        } catch (error) {
            console.error('Error checking storage size:', error);
            return { warning: false, error: error.message };
        }
    }

    /**
     * Show storage status
     */
    async showStorageStatus() {
        const info = await this.getStorageInfo();
        console.log('📊 Storage Status:', {
            organizations: info.organizationsCount,
            history: info.historyCount,
            vulnerabilities: info.vulnerabilitiesCount,
            estimatedSize: `${info.estimatedSizeMB} MB`
        });
        return info;
    }

    /**
     * Migrate data from localStorage to IndexedDB (one-time migration)
     */
    async migrateFromLocalStorage() {
        try {
            console.log('🔄 Checking for localStorage data to migrate...');
            
            const oldOrgs = localStorage.getItem('sbomplay_organizations');
            if (!oldOrgs) {
                console.log('✅ No localStorage data to migrate');
                return;
            }

            const organizations = JSON.parse(oldOrgs);
            console.log(`📦 Found ${organizations.length} organizations in localStorage`);

            await this.init();
            for (const org of organizations) {
                if (org.data) {
                    await this.saveAnalysisData(org.organization, org.data);
                    console.log(`✅ Migrated ${org.organization} to IndexedDB`);
                }
            }

            // Clear old localStorage data after successful migration
            localStorage.removeItem('sbomplay_organizations');
            localStorage.removeItem('sbomplay_history');
            localStorage.removeItem('sbomplay_vulnerabilities');
            
            console.log('✅ Migration from localStorage to IndexedDB complete!');
        } catch (error) {
            console.error('❌ Failed to migrate from localStorage:', error);
        }
    }

    /**
     * Save author analysis data
     * @param {string} contextId - Organization or repository name
     * @param {Array} authorData - Array of author analysis data
     */
    async saveAuthorAnalysis(contextId, authorData) {
        try {
            await this.init();
            
            const transaction = this.getTransaction(this.stores.authorAnalysis, 'readwrite');
            const store = transaction.objectStore(this.stores.authorAnalysis);
            
            const data = {
                contextId: contextId,
                timestamp: new Date().toISOString(),
                authors: authorData
            };
            
            const request = store.put(data);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    console.log(`✅ Author analysis saved for ${contextId}`);
                    resolve();
                };
                request.onerror = () => {
                    console.error(`❌ Failed to save author analysis for ${contextId}:`, request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error(`❌ Error saving author analysis for ${contextId}:`, error);
            throw error;
        }
    }

    /**
     * Load author analysis data
     * @param {string} contextId - Organization or repository name
     * @returns {Promise<Array|null>} Author analysis data or null if not found
     */
    async loadAuthorAnalysis(contextId) {
        try {
            await this.init();
            
            const transaction = this.getTransaction(this.stores.authorAnalysis, 'readonly');
            const store = transaction.objectStore(this.stores.authorAnalysis);
            const request = store.get(contextId);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    if (request.result) {
                        console.log(`✅ Author analysis loaded for ${contextId}`);
                        resolve(request.result.authors);
                    } else {
                        console.log(`ℹ️ No author analysis found for ${contextId}`);
                        resolve(null);
                    }
                };
                request.onerror = () => {
                    console.error(`❌ Failed to load author analysis for ${contextId}:`, request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error(`❌ Error loading author analysis for ${contextId}:`, error);
            return null;
        }
    }

    /**
     * Clear author analysis for a specific context
     * @param {string} contextId - Organization or repository name
     */
    async clearAuthorAnalysis(contextId) {
        try {
            await this.init();
            
            const transaction = this.getTransaction(this.stores.authorAnalysis, 'readwrite');
            const store = transaction.objectStore(this.stores.authorAnalysis);
            const request = store.delete(contextId);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    console.log(`✅ Author analysis cleared for ${contextId}`);
                    resolve();
                };
                request.onerror = () => {
                    console.error(`❌ Failed to clear author analysis for ${contextId}:`, request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error(`❌ Error clearing author analysis for ${contextId}:`, error);
            throw error;
        }
    }

    /**
     * Get all stored author analyses
     * @returns {Promise<Array>} Array of all author analysis entries
     */
    async getAllAuthorAnalyses() {
        try {
            await this.init();
            
            const transaction = this.getTransaction(this.stores.authorAnalysis, 'readonly');
            const store = transaction.objectStore(this.stores.authorAnalysis);
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    resolve(request.result || []);
                };
                request.onerror = () => {
                    console.error('❌ Failed to get all author analyses:', request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('❌ Error getting all author analyses:', error);
            return [];
        }
    }

    /**
     * Save single repository analysis
     * @param {string} owner - Repository owner
     * @param {string} name - Repository name
     * @param {Object} analysisData - Analysis data to save
     */
    async saveSingleRepoAnalysis(owner, name, analysisData) {
        try {
            await this.init();
            const repoKey = `${owner}/${name}`;
            const timestamp = new Date().toISOString();
            
            const dataToStore = {
                repoKey,
                owner,
                name,
                timestamp,
                ...analysisData
            };

            return new Promise((resolve, reject) => {
                const transaction = this.getTransaction(this.stores.singleRepoAnalyses, 'readwrite');
                const store = transaction.objectStore(this.stores.singleRepoAnalyses);
                const request = store.put(dataToStore);

                request.onsuccess = () => {
                    console.log(`✅ Saved single repo analysis for ${repoKey}`);
                    resolve();
                };
                request.onerror = () => {
                    console.error(`❌ Failed to save single repo analysis for ${repoKey}:`, request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('❌ Error saving single repo analysis:', error);
            throw error;
        }
    }

    /**
     * Load single repository analysis
     * @param {string} owner - Repository owner
     * @param {string} name - Repository name
     * @returns {Promise<Object|null>} Analysis data or null if not found
     */
    async loadSingleRepoAnalysis(owner, name) {
        try {
            await this.init();
            const repoKey = `${owner}/${name}`;

            return new Promise((resolve, reject) => {
                const transaction = this.getTransaction(this.stores.singleRepoAnalyses, 'readonly');
                const store = transaction.objectStore(this.stores.singleRepoAnalyses);
                const request = store.get(repoKey);

                request.onsuccess = () => {
                    if (request.result) {
                        console.log(`✅ Loaded single repo analysis for ${repoKey}`);
                        resolve(request.result);
                    } else {
                        console.log(`ℹ️ No analysis found for ${repoKey}`);
                        resolve(null);
                    }
                };
                request.onerror = () => {
                    console.error(`❌ Failed to load single repo analysis for ${repoKey}:`, request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('❌ Error loading single repo analysis:', error);
            return null;
        }
    }

    /**
     * Get all single repository analyses
     * @returns {Promise<Array>} Array of all single repo analyses
     */
    async getAllSingleRepoAnalyses() {
        try {
            await this.init();

            return new Promise((resolve, reject) => {
                const transaction = this.getTransaction(this.stores.singleRepoAnalyses, 'readonly');
                const store = transaction.objectStore(this.stores.singleRepoAnalyses);
                const request = store.getAll();

                request.onsuccess = () => {
                    const analyses = request.result || [];
                    // Sort by timestamp (newest first)
                    analyses.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    console.log(`✅ Retrieved ${analyses.length} single repo analyses`);
                    resolve(analyses);
                };
                request.onerror = () => {
                    console.error('❌ Failed to get all single repo analyses:', request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('❌ Error getting all single repo analyses:', error);
            return [];
        }
    }

    /**
     * Delete single repository analysis
     * @param {string} owner - Repository owner
     * @param {string} name - Repository name
     */
    async deleteSingleRepoAnalysis(owner, name) {
        try {
            await this.init();
            const repoKey = `${owner}/${name}`;

            return new Promise((resolve, reject) => {
                const transaction = this.getTransaction(this.stores.singleRepoAnalyses, 'readwrite');
                const store = transaction.objectStore(this.stores.singleRepoAnalyses);
                const request = store.delete(repoKey);

                request.onsuccess = () => {
                    console.log(`✅ Deleted single repo analysis for ${repoKey}`);
                    resolve();
                };
                request.onerror = () => {
                    console.error(`❌ Failed to delete single repo analysis for ${repoKey}:`, request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('❌ Error deleting single repo analysis:', error);
            throw error;
        }
    }

    /**
     * Get single repo analyses for a specific owner
     * @param {string} owner - Repository owner
     * @returns {Promise<Array>} Array of analyses for the owner
     */
    async getSingleRepoAnalysesForOwner(owner) {
        try {
            await this.init();

            return new Promise((resolve, reject) => {
                const transaction = this.getTransaction(this.stores.singleRepoAnalyses, 'readonly');
                const store = transaction.objectStore(this.stores.singleRepoAnalyses);
                const index = store.index('owner');
                const request = index.getAll(owner);

                request.onsuccess = () => {
                    const analyses = request.result || [];
                    // Sort by timestamp (newest first)
                    analyses.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    console.log(`✅ Retrieved ${analyses.length} single repo analyses for ${owner}`);
                    resolve(analyses);
                };
                request.onerror = () => {
                    console.error(`❌ Failed to get single repo analyses for ${owner}:`, request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('❌ Error getting single repo analyses for owner:', error);
            return [];
        }
    }
}
