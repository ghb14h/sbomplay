/**
 * Utility Functions - Common helpers used across SBOM Play
 */

const Utils = {
    /**
     * Date formatting utilities
     */
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    formatDateTime(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    formatRelativeTime(date) {
        if (!date) return 'N/A';
        const now = new Date();
        const diffMs = now - new Date(date);
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    },

    /**
     * Data formatting utilities
     */
    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    },

    formatNumber(num) {
        if (num === null || num === undefined) return '0';
        return num.toLocaleString('en-US');
    },

    formatPercentage(value, total, decimals = 1) {
        if (!total || total === 0) return '0%';
        const percentage = (value / total) * 100;
        return `${percentage.toFixed(decimals)}%`;
    },

    /**
     * String utilities
     */
    escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    },

    truncate(str, maxLength = 50, ellipsis = '...') {
        if (!str || str.length <= maxLength) return str;
        return str.substring(0, maxLength - ellipsis.length) + ellipsis;
    },

    capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    /**
     * Performance utilities
     */
    debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    throttle(func, limit = 100) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * DOM utilities
     */
    createElement(tag, className = '', innerHTML = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (innerHTML) element.innerHTML = innerHTML;
        return element;
    },

    toggleVisibility(elementId, forceShow = null) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        if (forceShow === null) {
            element.classList.toggle('hidden');
        } else if (forceShow) {
            element.classList.remove('hidden');
        } else {
            element.classList.add('hidden');
        }
    },

    showElement(elementId) {
        const element = document.getElementById(elementId);
        if (element) element.classList.remove('hidden');
    },

    hideElement(elementId) {
        const element = document.getElementById(elementId);
        if (element) element.classList.add('hidden');
    },

    /**
     * Array utilities
     */
    unique(array) {
        return [...new Set(array)];
    },

    sortBy(array, key, ascending = true) {
        return array.sort((a, b) => {
            const aVal = a[key];
            const bVal = b[key];
            if (aVal < bVal) return ascending ? -1 : 1;
            if (aVal > bVal) return ascending ? 1 : -1;
            return 0;
        });
    },

    groupBy(array, key) {
        return array.reduce((result, item) => {
            const group = item[key];
            if (!result[group]) result[group] = [];
            result[group].push(item);
            return result;
        }, {});
    },

    /**
     * URL utilities
     */
    getQueryParam(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    },

    setQueryParam(param, value) {
        const url = new URL(window.location);
        url.searchParams.set(param, value);
        window.history.pushState({}, '', url);
    },

    /**
     * Storage utilities
     */
    downloadJSON(data, filename = 'data.json') {
        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    downloadCSV(data, filename = 'data.csv') {
        const blob = new Blob([data], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Validation utilities
     */
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    },

    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    /**
     * Error handling utilities
     */
    logError(context, error, additionalInfo = {}) {
        console.error(`[${context}] Error:`, {
            message: error.message,
            stack: error.stack,
            ...additionalInfo
        });
    },

    /**
     * Badge generation utilities
     */
    createBadge(text, type = 'primary') {
        const badgeClasses = {
            'primary': 'badge bg-primary',
            'success': 'badge bg-success',
            'warning': 'badge bg-warning',
            'danger': 'badge bg-danger',
            'info': 'badge bg-info',
            'light': 'badge bg-light text-dark',
            'dark': 'badge bg-dark',
            'critical': 'badge-critical',
            'high': 'badge-high',
            'medium': 'badge-medium',
            'low': 'badge-low',
            'none': 'badge-none'
        };
        
        const className = badgeClasses[type] || badgeClasses['primary'];
        return `<span class="${className}">${this.escapeHtml(text)}</span>`;
    },

    /**
     * Ecosystem utilities
     */
    getEcosystemIcon(ecosystem) {
        const icons = {
            'npm': 'fab fa-npm',
            'pypi': 'fab fa-python',
            'maven': 'fab fa-java',
            'nuget': 'fas fa-code',
            'cargo': 'fas fa-cube',
            'composer': 'fab fa-php',
            'go': 'fas fa-code',
            'githubactions': 'fab fa-github',
            'docker': 'fab fa-docker',
            'helm': 'fas fa-dharmachakra',
            'terraform': 'fas fa-server'
        };
        return icons[ecosystem?.toLowerCase()] || 'fas fa-box';
    },

    /**
     * Copy to clipboard
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('Failed to copy:', err);
            return false;
        }
    },

    /**
     * Sleep utility for async operations
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}

