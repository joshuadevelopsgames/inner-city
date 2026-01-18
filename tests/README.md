# End-to-End Integration Tests

Comprehensive test suite validating critical system invariants for Inner City ticketing platform.

## Test Structure

```
tests/
├── README.md (this file)
├── TEST_PLAN.md (test plan documentation)
├── test-helpers.ts (shared utilities)
├── e2e-invariants.test.ts (main test suite)
└── chaos-concurrency.test.ts (stress tests)
```

## Prerequisites

1. **Deno installed** (v1.30+)
   ```bash
   curl -fsSL https://deno.land/install.sh | sh
   ```

2. **Environment variables set:**
   ```bash
   export SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   ```

3. **Supabase project** with migrations applied:
   ```bash
   supabase db push
   ```

## Running Tests

### Run All Tests

```bash
deno test --allow-net --allow-env tests/e2e-invariants.test.ts
```

### Run Specific Test

```bash
deno test --allow-net --allow-env tests/e2e-invariants.test.ts -A test_inventory_never_negative
```

### Run Chaos Test

```bash
deno test --allow-net --allow-env tests/chaos-concurrency.test.ts
```

### Run with Verbose Output

```bash
deno test --allow-net --allow-env tests/e2e-invariants.test.ts --verbose
```

### Run All Tests (including chaos)

```bash
deno test --allow-net --allow-env tests/
```

## Test Coverage

### Invariant Tests

1. ✅ **Inventory Never Negative**
   - Concurrent purchases
   - Reservation expiration
   - Partial failures

2. ✅ **Ticket Checked In At Most Once**
   - Multiple devices
   - Concurrent scans
   - Offline reconciliation

3. ✅ **Webhook Idempotency**
   - Duplicate webhook processing
   - Same payment intent multiple times

4. ✅ **Transfer Ownership**
   - Ownership updates
   - Audit trail preservation
   - Transfer validation

5. ✅ **Refund Invalidation**
   - Ticket status updates
   - Payment status updates
   - Check-in prevention

6. ✅ **Offline Scan Reconciliation**
   - Conflict detection
   - Sync reconciliation
   - Cache updates

### Chaos Tests

- 500 concurrent operations
- Rapid sequential operations
- Extreme load scenarios

## Test Output

Tests output detailed logs:
- ✅ Successful operations
- ❌ Failed operations
- 📊 Summary statistics
- 🔍 Invariant verification

Example output:
```
🧪 Running end-to-end invariant tests...
✅ Successful purchases: 50
❌ Failed purchases: 50
✅ Inventory: 50 sold, 0 reserved, 100 total
✅ Ticket can only be checked in once
✅ Webhook idempotency verified
```

## Test Data Management

- Each test creates isolated test data
- Tests clean up after themselves
- Uses UUIDs to prevent conflicts
- Test contexts prevent interference

## Troubleshooting

### Tests Fail with "Connection Error"

- Verify `SUPABASE_URL` is correct
- Check network connectivity
- Verify Supabase project is accessible

### Tests Fail with "Permission Denied"

- Verify `SUPABASE_SERVICE_ROLE_KEY` is set
- Check key has service role permissions
- Verify RLS policies allow service role

### Tests Are Slow

- Normal for integration tests (network calls)
- Chaos tests may take 1-2 minutes
- Consider running tests in parallel (Deno supports this)

### Tests Leave Data Behind

- Check cleanup functions are called
- Verify test context cleanup
- Manually clean up if needed:
  ```sql
  DELETE FROM tickets WHERE id LIKE 'test-%';
  DELETE FROM events WHERE title LIKE 'Test Event%';
  ```

## Continuous Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
      - run: deno test --allow-net --allow-env tests/
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

## Best Practices

1. **Run tests before committing**
   ```bash
   deno test --allow-net --allow-env tests/e2e-invariants.test.ts
   ```

2. **Run chaos tests before releases**
   ```bash
   deno test --allow-net --allow-env tests/chaos-concurrency.test.ts
   ```

3. **Monitor test duration**
   - Full suite should complete in < 5 minutes
   - Chaos test may take 1-2 minutes

4. **Review test output**
   - Check for unexpected failures
   - Verify invariant assertions
   - Review operation counts

## Known Limitations

- Tests require live Supabase instance
- Tests may be slow due to network calls
- Some tests may be flaky under extreme load
- Test data cleanup depends on foreign key cascades

## Contributing

When adding new tests:

1. Follow existing test structure
2. Use test helpers from `test-helpers.ts`
3. Clean up test data in `finally` blocks
4. Add test to appropriate file
5. Update this README if needed

## Questions?

See `TEST_PLAN.md` for detailed test plan and `docs/` for system documentation.
