#!/bin/bash
# Test GraphQL API with authentication
# Usage: ./scripts/test-graphql-api.sh [token]

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# API endpoint
API_URL="http://localhost:3000/graphql"

# Get token from argument or generate one
if [ -z "$1" ]; then
    echo -e "${YELLOW}No token provided, generating test token...${NC}\n"
    TOKEN=$(node scripts/generate-test-token.js test-user-123 | grep -A 1 "Generated JWT Token:" | tail -1 | xargs)
else
    TOKEN="$1"
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Testing GraphQL API${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Test 1: Test unauthenticated request (should fail)
echo -e "${YELLOW}Test 1: Unauthenticated request (should fail)${NC}"
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { toolInstances { id toolType createdAt } }"
  }')
echo "$RESPONSE" | jq '.'
echo ""

# Test 2: Test authenticated request
echo -e "${YELLOW}Test 2: Authenticated request - List tool instances${NC}"
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "query { toolInstances { id toolType createdAt } }"
  }')
echo "$RESPONSE" | jq '.'
echo ""

# Test 3: Create a new tool instance
echo -e "${YELLOW}Test 3: Create new tool instance${NC}"
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "mutation { createToolInstance(toolType: \"schema-design\") { instance { id toolType docId createdAt } } }"
  }')
echo "$RESPONSE" | jq '.'

# Extract instance ID from response
INSTANCE_ID=$(echo "$RESPONSE" | jq -r '.data.createToolInstance.instance.id // empty')

if [ -n "$INSTANCE_ID" ]; then
    echo -e "\n${GREEN}✓ Tool instance created successfully!${NC}"
    echo -e "${BLUE}  Instance ID: $INSTANCE_ID${NC}"
    
    # Test 4: Verify the instance was created
    echo -e "\n${YELLOW}Test 4: Verify tool instance exists${NC}"
    VERIFY_RESPONSE=$(curl -s -X POST "$API_URL" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d '{
        "query": "query { toolInstances { id toolType createdAt } }"
      }')
    echo "$VERIFY_RESPONSE" | jq '.'
    
    # Test 5: Validate the tool instance
    echo -e "\n${YELLOW}Test 5: Validate tool instance${NC}"
    VALIDATE_RESPONSE=$(curl -s -X POST "$API_URL" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{
        \"query\": \"mutation { validateToolInstance(instanceId: \\\"$INSTANCE_ID\\\") { valid errors { path message } } }\"
      }")
    echo "$VALIDATE_RESPONSE" | jq '.'
else
    echo -e "\n${RED}✗ Failed to create tool instance${NC}"
    exit 1
fi

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  All tests completed!${NC}"
echo -e "${GREEN}========================================${NC}\n"
