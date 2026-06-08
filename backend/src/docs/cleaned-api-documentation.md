# 🚀 Bitcoin Auction Platform - Clean API Documentation

## ✅ **Essential APIs Only - Production Ready**

### 🔗 Base URL
```
http://localhost:3000
```

### 📋 Authentication
```
Authorization: Bearer <jwt-token>
```

---

## 🎯 **AUCTION MANAGEMENT (9 APIs)**

### 1. Create Auction (Admin)
```http
POST /auctions
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "title": "Rare Bitcoin Ordinal #12345",
  "description": "A unique digital artifact on Bitcoin",
  "startingBid": 100000,
  "reservePrice": 500000,
  "startTime": "2024-02-01T10:00:00Z",
  "endTime": "2024-02-07T10:00:00Z",
  "inscriptionId": "6fb976ab...i0",
  "paymentMethod": "BTC",
  "imageUrls": ["https://example.com/image.jpg"]
}
```

### 2. Get All Auctions
```http
GET /auctions?status=live&paymentMethod=BTC&limit=20&offset=0
```

### 3. Get Auction Details
```http
GET /auctions/{auctionId}
```

### 4. Update Auction (Admin)
```http
PUT /auctions/{auctionId}
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "status": "live",
  "reservePrice": 600000
}
```

### 5. Place Bid ⭐ **CORE**
```http
POST /auctions/{auctionId}/bids
Content-Type: application/json
Authorization: Bearer <user-token>

{
  "amount": 200000,
  "walletAddress": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
}

# Response includes PSBT for BTC auctions:
{
  "success": true,
  "data": {
    "bid": {...},
    "psbtHex": "cHNidP8BAH0CAA..."  # For Bitcoin payment
  }
}
```

### 6. Get Auction Bids
```http
GET /auctions/{auctionId}/bids?limit=50
```

### 7. End Auction (Admin)
```http
POST /auctions/{auctionId}/end
Authorization: Bearer <admin-token>
```

### 8. Mark as Paid (Admin)
```http
POST /auctions/{auctionId}/mark-paid
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "txHash": "bitcoin_transaction_hash_123abc..."
}
```

### 9. Transfer Inscription (Admin)
```http
POST /auctions/{auctionId}/transfer
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "finalPsbtHex": "finalized_psbt_hex_string"
}
```

---

## ⚡ **BITCOIN PSBT (4 APIs)**

### 1. Create PSBT ⭐ **CORE**
```http
POST /psbt/create
Content-Type: application/json

{
  "auctionId": "auction_id_123",
  "bidderAddress": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
  "bidAmount": 200000
}

# Response:
{
  "success": true,
  "data": {
    "psbtHex": "cHNidP8BAH0CAA...",
    "estimatedFee": 4080,
    "auctionId": "auction_id_123",
    "bidAmount": 200000
  }
}
```

### 2. Finalize PSBT ⭐ **CORE**
```http
POST /psbt/finalize
Content-Type: application/json

{
  "auctionId": "auction_id",
  "signedPsbtHex": "signed_psbt_hex_from_wallet",
  "winnerAddress": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
}
```

### 3. Validate PSBT ⭐ **CORE**
```http
POST /psbt/validate
Content-Type: application/json

{
  "psbtHex": "psbt_hex_to_validate"
}

# Response:
{
  "success": true,
  "data": {
    "isValid": true,
    "validatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### 4. Get Transaction Status ⭐ **CORE**
```http
GET /psbt/transaction/{txId}

# Response:
{
  "success": true,
  "data": {
    "txId": "abc123...",
    "confirmed": true,
    "confirmations": 6,
    "blockHeight": 800000
  }
}
```

---

## 💳 **WALLET MANAGEMENT (5 APIs)**

### 1. Connect Wallet ⭐ **CORE**
```http
POST /wallet/connect
Content-Type: application/json
Authorization: Bearer <user-token>

{
  "walletAddress": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
  "walletType": "hiro",
  "publicKey": "0x123456789abcdef..."
}
```

### 2. Verify Wallet ⭐ **CORE**
```http
POST /wallet/verify
Content-Type: application/json
Authorization: Bearer <user-token>

{
  "walletAddress": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
  "signature": "wallet_signature_string",
  "message": "Verify wallet ownership for Bitcoin Auction Platform"
}
```

### 3. Get Wallet Balance ⭐ **CORE**
```http
GET /wallet/balance/{walletAddress}

# Response:
{
  "success": true,
  "data": {
    "confirmed": 50000000,
    "unconfirmed": 0,
    "total": 50000000,
    "utxos": [...]
  }
}
```

### 4. Sign PSBT ⭐ **CORE**
```http
POST /wallet/sign-psbt
Content-Type: application/json
Authorization: Bearer <user-token>

{
  "psbtHex": "cHNidP8BAH0CAA...",
  "walletAddress": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
  "walletType": "hiro"
}
```

### 5. Disconnect Wallet
```http
POST /wallet/disconnect
Authorization: Bearer <user-token>
```

---

## 🏛️ **ADMIN MANAGEMENT (6 APIs)**

### 1. Get All Users ⭐ **CORE**
```http
GET /admin/users?kycStatus=pending&paymentVerified=true&limit=20&offset=0
Authorization: Bearer <admin-token>
```

### 2. Get User Details ⭐ **CORE**
```http
GET /admin/users/{userId}
Authorization: Bearer <admin-token>
```

### 3. Update KYC Status ⭐ **CORE**
```http
PATCH /admin/users/{userId}/kyc-status
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "kycStatus": "approved",
  "reason": "All documents verified successfully"
}
```

### 4. Update Payment Verification ⭐ **CORE**
```http
PATCH /admin/users/{userId}/payment-verification
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "paymentMethodVerified": true
}
```

### 5. Get KYC Statistics ⭐ **CORE**
```http
GET /admin/kyc-stats
Authorization: Bearer <admin-token>

# Response:
{
  "success": true,
  "data": {
    "totalUsers": 150,
    "kycStats": {
      "pending": 25,
      "approved": 120,
      "rejected": 5
    },
    "verifiedPayments": 115,
    "kycCompletionRate": "80.00"
  }
}
```

### 6. Get Auction Statistics ⭐ **CORE**
```http
GET /admin/auction-stats
Authorization: Bearer <admin-token>

# Response:
{
  "success": true,
  "data": {
    "totalAuctions": 45,
    "auctionsByStatus": {
      "live": 5,
      "ended": 35,
      "upcoming": 5
    },
    "paymentStats": {
      "paid": 30,
      "transferred": 28
    },
    "paymentMethods": {
      "BTC": 40,
      "ETH": 3,
      "Manual": 2
    },
    "totalBids": 450
  }
}
```

---

## 📊 **API SUMMARY**

| **Category** | **APIs** | **Essential** |
|--------------|----------|---------------|
| 🎯 **Auctions** | 9 | All essential for core functionality |
| ⚡ **PSBT** | 4 | Bitcoin transaction handling |
| 💳 **Wallets** | 5 | Hiro/Xverse integration |
| 🏛️ **Admin** | 6 | User & platform management |
| **TOTAL** | **24** | **Production ready!** |

---

## 🔥 **Removed Redundant/Mock APIs:**

### ❌ **Removed from Admin:**
- `/admin/auctions` (use `/auctions` instead)
- `/admin/auctions/:id` (use `/auctions/:id` instead)
- `/admin/verify-wallet` (use `/wallet/verify` instead)
- `/admin/activities` (overkill for MVP)
- `/admin/platform-stats` (combined into other stats)

### ❌ **Removed from Wallet:**
- `/wallet/inscriptions/:address` (mock implementation)
- `/wallet/transactions/:address` (mock implementation)
- `/wallet/set-primary` (single wallet sufficient)
- `/wallet/my-wallets` (single wallet model)

### ❌ **Removed from PSBT:**
- `/psbt/estimate-fee` (included in create response)
- `/psbt/parse` (mock data only)

---

## 🎯 **Complete Workflow:**

### **Phase 1: Setup**
1. `PATCH /admin/users/{id}/kyc-status` - Approve user
2. `PATCH /admin/users/{id}/payment-verification` - Verify payment

### **Phase 2: Wallet**
1. `POST /wallet/connect` - Connect wallet
2. `POST /wallet/verify` - Verify ownership
3. `GET /wallet/balance/{address}` - Check balance

### **Phase 3: Auction**
1. `POST /auctions` - Create auction (admin)
2. `GET /auctions` - Browse auctions
3. `POST /auctions/{id}/bids` - Place bid (auto-creates PSBT)

### **Phase 4: PSBT**
1. `POST /wallet/sign-psbt` - Sign with wallet
2. `POST /psbt/validate` - Validate signature
3. `GET /psbt/transaction/{txId}` - Check status

### **Phase 5: Completion**
1. `POST /auctions/{id}/end` - End auction
2. `POST /auctions/{id}/mark-paid` - Mark paid
3. `POST /psbt/finalize` - Finalize transfer
4. `POST /auctions/{id}/transfer` - Complete transfer

---

**🎉 Clean, focused, production-ready API set! 24 essential endpoints covering complete auction workflow.** 🚀 