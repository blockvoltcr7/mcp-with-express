# Technical Debt & Improvement Opportunities

## Current Technical Debt

### High Priority

#### 1. Missing Test Coverage
**Issue:** No automated tests exist (`pnpm test` exits immediately)

**Impact:**
- No regression detection
- Manual testing required for all changes
- Risk of breaking changes in production

**Recommendation:**
```typescript
// Suggested test structure
src/
  __tests__/
    create-server.spec.ts
    integration.spec.ts
    nws-api.spec.ts
```

**Test Framework:** Vitest or Jest with TypeScript support

**Coverage Goals:**
- Unit tests for `makeNWSRequest()`, `formatAlert()`
- Integration tests for tool handlers
- Mock NWS API responses
- Test error handling paths

---

#### 2. No Rate Limiting
**Issue:** Server accepts unlimited requests without throttling

**Impact:**
- Vulnerable to abuse/DDoS
- Could overwhelm NWS API
- No protection against runaway agents

**Recommendation:**
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later'
});

app.use('/mcp', limiter);
```

---

#### 3. No Caching Layer
**Issue:** Every request hits NWS API, even for identical queries

**Impact:**
- Slower response times
- Unnecessary load on NWS API
- Higher latency for users

**Recommendation:**
```typescript
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 1800 }); // 30 min TTL

async function makeNWSRequest<T>(url: string): Promise<T | null> {
  const cached = cache.get<T>(url);
  if (cached) return cached;
  
  const data = await fetch(url);
  if (data) cache.set(url, data);
  return data;
}
```

---

### Medium Priority

#### 4. Generic User-Agent
**Issue:** `USER_AGENT = "weather-app/1.0"` is not specific to deployment

**Impact:**
- NWS cannot identify traffic source
- Violates NWS API best practices
- Could be blocked if abused

**Recommendation:**
```typescript
const USER_AGENT = process.env.USER_AGENT || "weather-app/1.0 (contact@yourdomain.com)";
```

---

#### 5. No Structured Logging
**Issue:** Uses `console.log()` and `console.error()` directly

**Impact:**
- Difficult to parse logs in production
- No log levels or filtering
- Missing context (timestamps, request IDs)

**Recommendation:**
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' })
  ]
});

logger.info('MCP request received', { method: req.body.method, id: req.body.id });
```

---

#### 6. No Request Validation Middleware
**Issue:** Request validation happens deep in the stack

**Impact:**
- Errors caught late in processing
- Inconsistent error messages
- Harder to debug invalid requests

**Recommendation:**
```typescript
import { z } from 'zod';

const mcpRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.any()).optional()
});

app.post('/mcp', (req, res, next) => {
  const result = mcpRequestSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid Request' },
      id: null
    });
  }
  next();
});
```

---

#### 7. Hardcoded CORS Configuration
**Issue:** `origin: true` allows all origins

**Impact:**
- Security risk in production
- No control over who can access API
- Potential for abuse

**Recommendation:**
```typescript
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept']
}));
```

---

### Low Priority

#### 8. No Health Check Endpoint
**Issue:** No way to verify server is running and healthy

**Impact:**
- Difficult to monitor uptime
- Load balancers can't detect failures
- No readiness/liveness probes

**Recommendation:**
```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});
```

---

#### 9. No Metrics/Observability
**Issue:** No performance metrics or tracing

**Impact:**
- Can't measure response times
- No visibility into errors
- Difficult to optimize

**Recommendation:**
```typescript
import promClient from 'prom-client';

const requestDuration = new promClient.Histogram({
  name: 'mcp_request_duration_seconds',
  help: 'Duration of MCP requests in seconds',
  labelNames: ['method', 'status']
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});
```

---

#### 10. No Input Sanitization
**Issue:** State codes and coordinates not sanitized

**Impact:**
- Potential for injection attacks
- Malformed requests to NWS API
- Unclear error messages

**Recommendation:**
```typescript
// Already using Zod, but could add:
const stateSchema = z.string()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'State must be 2 uppercase letters')
  .transform(s => s.toUpperCase());
```

---

## Code Quality Issues

### 1. Duplicate Error Handling
**Location:** Multiple places check for null responses

**Improvement:** Create centralized error handler
```typescript
function createErrorResponse(message: string) {
  return {
    content: [{ type: "text", text: message }]
  };
}
```

---

### 2. Magic Numbers
**Location:** Coordinate precision (`.toFixed(4)`)

**Improvement:** Use named constants
```typescript
const COORDINATE_PRECISION = 4;
const latitude.toFixed(COORDINATE_PRECISION);
```

---

### 3. Inconsistent Error Messages
**Location:** Tool handlers return different error formats

**Improvement:** Standardize error responses
```typescript
enum ErrorType {
  API_FAILURE = 'Failed to retrieve data',
  NO_DATA = 'No data available',
  INVALID_LOCATION = 'Location not supported'
}
```

---

## Security Considerations

### 1. No Authentication
**Current:** Anyone can call the MCP endpoint

**Risk:** Abuse, cost (if using paid APIs), data scraping

**Solution:**
```typescript
app.post('/mcp', authenticateRequest, async (req, res) => {
  // handler
});

function authenticateRequest(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || !isValidToken(token)) {
    return res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized' },
      id: null
    });
  }
  next();
}
```

---

### 2. No Request Size Limits
**Current:** Express default (100kb) may be too large

**Risk:** Memory exhaustion, DoS attacks

**Solution:**
```typescript
app.use(express.json({ limit: '10kb' }));
```

---

### 3. No Timeout Configuration
**Current:** Requests can hang indefinitely

**Risk:** Resource exhaustion, poor UX

**Solution:**
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5000);

const response = await fetch(url, { 
  headers,
  signal: controller.signal 
});
clearTimeout(timeout);
```

---

## Performance Optimizations

### 1. Parallel NWS Requests
**Current:** `get-forecast` makes sequential requests

**Improvement:**
```typescript
// Instead of:
const pointsData = await makeNWSRequest(pointsUrl);
const forecastData = await makeNWSRequest(forecastUrl);

// Could batch if multiple forecasts needed:
const [points1, points2] = await Promise.all([
  makeNWSRequest(url1),
  makeNWSRequest(url2)
]);
```

---

### 2. Connection Pooling
**Current:** Each request creates new HTTP connection

**Improvement:**
```typescript
import { Agent } from 'https';

const agent = new Agent({
  keepAlive: true,
  maxSockets: 50
});

fetch(url, { agent });
```

---

### 3. Response Compression
**Current:** No compression for responses

**Improvement:**
```typescript
import compression from 'compression';
app.use(compression());
```

---

## Documentation Gaps

### Missing Documentation
- [ ] Deployment guide for AWS/GCP
- [ ] Monitoring and alerting setup
- [ ] Disaster recovery procedures
- [ ] API versioning strategy
- [ ] Migration guide for breaking changes

### Outdated Documentation
- [ ] README mentions peer dependency warnings (may be resolved)
- [ ] No changelog or release notes

---

## Dependency Management

### Potential Issues

| Dependency | Current | Latest | Risk |
|------------|---------|--------|------|
| express | 4.21.2 | 4.x | Low (stable) |
| @modelcontextprotocol/sdk | 1.10.0 | Check | Medium (new protocol) |
| zod | 3.25.76 | 3.x | Low (stable) |

### Recommendations
1. Set up Dependabot for automated updates
2. Pin major versions in package.json
3. Test updates in staging before production
4. Document breaking changes

---

## Scalability Concerns

### Current Limitations

1. **Stateless Sessions:** Good for scaling, but no session persistence
2. **No Database:** Can't store historical data or analytics
3. **Single Region:** NWS API is US-based, adds latency for international users
4. **No Queue System:** Can't handle burst traffic gracefully

### Scaling Path

**Phase 1 (Current):** Single serverless deployment
- ✅ Good for: < 1000 req/min
- ✅ Cost: ~$0-10/month

**Phase 2 (Add Caching):** Redis cache layer
- ✅ Good for: < 10,000 req/min
- ✅ Cost: ~$20-50/month

**Phase 3 (Add Queue):** Message queue for async processing
- ✅ Good for: < 100,000 req/min
- ✅ Cost: ~$100-200/month

**Phase 4 (Multi-Region):** CDN + regional deployments
- ✅ Good for: > 100,000 req/min
- ✅ Cost: ~$500+/month

---

## Recommended Priority Order

### Sprint 1: Foundation
1. ✅ Add test framework and basic tests
2. ✅ Implement rate limiting
3. ✅ Add health check endpoint
4. ✅ Structured logging

### Sprint 2: Performance
1. ✅ Add caching layer
2. ✅ Implement request timeouts
3. ✅ Add response compression
4. ✅ Connection pooling

### Sprint 3: Security
1. ✅ Add authentication
2. ✅ Restrict CORS origins
3. ✅ Request size limits
4. ✅ Input sanitization

### Sprint 4: Observability
1. ✅ Metrics endpoint
2. ✅ Error tracking (Sentry)
3. ✅ Performance monitoring
4. ✅ Alerting setup

---

## Breaking Changes to Consider

### API Versioning
**Current:** No versioning strategy

**Proposal:**
```typescript
app.post('/v1/mcp', handler);
app.post('/v2/mcp', handlerV2);
```

### Response Format Changes
**Current:** Plain text responses

**Proposal:** Add structured data option
```typescript
{
  content: [
    {
      type: "text",
      text: "..."
    },
    {
      type: "data",
      data: { temperature: 55, unit: "F" }
    }
  ]
}
```

---

## Estimated Effort

| Task | Effort | Impact | Priority |
|------|--------|--------|----------|
| Add tests | 2-3 days | High | P0 |
| Rate limiting | 2 hours | High | P0 |
| Caching | 4 hours | High | P1 |
| Logging | 4 hours | Medium | P1 |
| Authentication | 1 day | Medium | P2 |
| Metrics | 1 day | Medium | P2 |
| Health checks | 1 hour | Low | P3 |
| CORS fixes | 2 hours | Medium | P1 |

**Total estimated effort:** 5-6 days for P0-P1 items
