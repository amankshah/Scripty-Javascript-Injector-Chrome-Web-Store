class URLPatternMatcher {
    constructor(identifierType, matchType, identifier) {
        if (!(this instanceof URLPatternMatcher)) {
            throw new TypeError("Cannot call a class as a function");
        }
        this.identifierType = identifierType;
        this.matchType = matchType;
        this.identifier = identifier;
    }

    // Matches a URL against a pattern
    matchPattern(url, pattern) {
        const urlObj = new URL(url);
        const [protocol, ...rest] = pattern.split("://");
        const [host, ...pathParts] = rest.join("://").split("/");
        const path = "/" + pathParts.join("/");
        const urlProtocol = urlObj.protocol.slice(0, -1);

        return !(
            (protocol !== "*" && protocol !== urlProtocol) ||
            !new RegExp("^" + host.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$").test(urlObj.hostname) ||
            !new RegExp("^" + path.replace(/\*/g, ".*") + "$").test(urlObj.pathname)
        );
    }

    // Validates if a pattern is in correct format
    isValidPattern(pattern) {
        return /^(\*|https?|http|file):\/\/(\*|\*\.[^/*]+|[^/*]+)\/(.*)?$/.test(pattern);
    }

    // Generates match patterns based on identifier type
    generate() {
        const match = this.getMatch();
        return Array.isArray(match) ? match : [match];
    }

    // Gets the appropriate match based on identifier type
    getMatch() {
        switch (this.identifierType) {
            case "pattern":
            case "url":
                return this.getMatchPattern();
            case "host":
                return this.generateHostPattern();
            case "path":
                return this.generatePathPattern();
            default:
                throw new Error('Invalid identifier type. Must be "host", "path", or "pattern".');
        }
    }

    // Generates host-based pattern
    generateHostPattern() {
        if (this.matchType === "equals") {
            return `*://${this.identifier}/*`;
        }
        throw new Error("Invalid match type. Only equals is supported for host.");
    }

    // Generates path-based pattern
    generatePathPattern() {
        if (this.matchType === "equals") {
            const path = this.identifier.startsWith("/") ? this.identifier : `/${this.identifier}`;
            return `*://*${path}`;
        }
        if (this.matchType === "contains") {
            return `*://*/*${this.identifier}*`;
        }
        throw new Error('Invalid match type. Must be "equals" or "contains".');
    }

    // Generates URL-based pattern
    generateUrlPattern() {
        if (this.matchType === "equals") {
            return `*://*/${this.identifier}`;
        }
        if (this.matchType === "contains") {
            return `*://*/*${this.identifier}*`;
        }
        throw new Error('Invalid match type. Must be "equals" or "contains".');
    }

    // Gets match patterns from identifier
    getMatchPattern() {
        return this.identifier
            .split(",")
            .map(part => part.trim())
            .filter(pattern => this.isValidPattern(pattern));
    }
} 