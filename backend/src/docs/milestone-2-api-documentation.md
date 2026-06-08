# Milestone 2: Core PSBT Auction Engine - API Documentation

## Overview
This document covers all APIs implemented for **Milestone 2: Core PSBT Auction Engine** which includes:
- ✅ PSBT auction logic (create, finalize, transfer)
- ✅ Wallet integration (Hiro/Xverse)
- ✅ Admin controls for KYC & auctions
- ✅ Bid placement + restriction check logic

---

## 🔗 Base URL
```
http://localhost:3000
```

---

## 📋 Authentication
Most endpoints require authentication. Include JWT token in header:
```
Authorization: Bearer <your-jwt-token>
```

---

## 🎯 Auction Management APIs

### 1. Create Auction (Admin Only)
```http
POST /auctions
Content-Type: application/json

{
  "title": "Rare Bitcoin Ordinal #12345",
  "description": "A unique digital artifact on Bitcoin",
  "startingBid": 100000,
  "reservePrice": 500000,
  "startTime": "2024-02-01T10:00:00Z",
  "endTime": "2024-02-07T10:00:00Z",
  "inscriptionId": "6fb976ab49dcec017f1e201e84395983204ae1a7c2abf7ced0a85d692e442799i0",
  "paymentMethod": "BTC",
  "imageUrls": ["https://example.com/image1.jpg"],
  "buyNowEnabled": false,
  "buyNowPrice": 1000000
}
```

### 2. Get All Auctions
```http
GET /auctions?status=live&paymentMethod=BTC&limit=20&offset=0
```

### 3. Get Auction By ID
```http
GET /auctions/{auctionId}
```

### 4. Update Auction (Admin Only)
```http
PUT /auctions/{auctionId}
Content-Type: application/json

{
  "status": "live",
  "reservePrice": 600000
}
```

### 5. End Auction (Admin Only)
```http
POST /auctions/{auctionId}/end
```

---

## 💰 Bidding APIs

### 1. Place Bid (With Payment Verification Check)
```http
POST /auctions/{auctionId}/bids
Content-Type: application/json

{
  "amount": 150000,
  "walletAddress": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bid placed successfully",
  "data": {
    "bid": {
      "_id": "bid_id",
      "amount": 150000,
      "status": "active",
      "bidTime": "2024-01-15T10:30:00Z"
    },
    "psbtHex": "cHNidP8BAH0CAA..." // PSBT for Bitcoin payment method
  }
}
```

### 2. Get Auction Bids
```http
GET /auctions/{auctionId}/bids?limit=50
```

---

## 🔧 PSBT Management APIs

### 1. Create PSBT for Bidding
```http
POST /auctions/psbt/create
Content-Type: application/json

{
  "auctionId": "auction_id",
  "bidderAddress": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
  "bidAmount": 200000
}
```

### 2. Finalize PSBT for Transfer
```http
POST /auctions/psbt/finalize
Content-Type: application/json

{
  "auctionId": "auction_id",
  "signedPsbtHex": "cHNidP8BAH0CAA...",
  "winnerAddress": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
}
```

### 3. Validate PSBT Signature
```http
POST /auctions/psbt/validate
Content-Type: application/json

{
  "psbtHex": "cHNidP8BAH0CAA..."
}
```

### 4. Get Transaction Status
```http
GET /auctions/transaction/{txId}
```

---

## 🏦 Admin Management APIs

### 1. Get All Users (Admin)
```http
GET /admin/users?kycStatus=pending&paymentVerified=true&limit=20&offset=0
```

### 2. Get User Details (Admin)
```http
GET /admin/users/{userId}
```

### 3. Update KYC Status (Admin)
```http
PATCH /admin/users/{userId}/kyc
Content-Type: application/json

{
  "kycStatus": "approved",
  "reason": "All documents verified successfully"
}
```

### 4. Update Payment Verification (Admin)
```http
PATCH /admin/users/{userId}/payment-verification
Content-Type: application/json

{
  "paymentMethodVerified": true
}
```

### 5. Get KYC Statistics (Admin)
```http
GET /admin/kyc-stats
```

### 6. Get Auction Statistics (Admin)
```http
GET /admin/auction-stats
```

### 7. Mark Auction as Paid (Admin)
```http
POST /auctions/{auctionId}/mark-paid
Content-Type: application/json

{
  "txHash": "1a2b3c4d5e6f7g8h9i0j..."
}
```

### 8. Transfer Inscription (Admin)
```http
POST /auctions/{auctionId}/transfer
Content-Type: application/json

{
  "finalPsbtHex": "cHNidP8BAH0CAA..."
}
```

### 9. Get Platform Statistics (Admin)
```http
GET /admin/platform-stats
```

---

## 💳 Wallet Integration APIs

### 1. Connect Wallet (Hiro/Xverse)
```http
POST /wallet/connect
Content-Type: application/json

{
  "walletAddress": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
  "walletType": "hiro",
  "publicKey": "03f9f0c90d999915a5..."
}
```

### 2. Verify Wallet Ownership
```http
POST /wallet/verify
Content-Type: application/json

{
  "walletAddress": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
  "signature": "H4c9Jf5mL9p2N...",
  "message": "Verify wallet ownership for Bitcoin Auction Platform"
}
```

### 3. Get Wallet Balance
```http
GET /wallet/balance/{walletAddress}
```

### 4. Get Wallet Inscriptions
```http
GET /wallet/inscriptions/{walletAddress}?limit=20&offset=0
```

### 5. Get User's Connected Wallets
```http
GET /wallet/my-wallets
```

### 6. Disconnect Wallet
```http
DELETE /wallet/disconnect
Content-Type: application/json

{
  "walletAddress": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
}
```

### 7. Sign PSBT with Wallet
```http
POST /wallet/sign
Content-Type: application/json

{
  "psbtHex": "cHNidP8BAH0CAA...",
  "walletAddress": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
  "walletType": "hiro"
}
```

### 8. Get Wallet Transactions
```http
GET /wallet/transactions/{walletAddress}?limit=50&offset=0
```

**Note:** Supported wallet types are: `hiro` and `xverse` (hardcoded in frontend)

---

## 📊 Response Format

All APIs follow consistent response format:

### Success Response:
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data
  },
  "pagination": {  // Only for paginated responses
    "total": 100,
    "limit": 20,
    "offset": 0
  }
}
```

### Error Response:
```json
{
  "success": false,
  "message": "Error description",
  "error": {
    "code": "ERROR_CODE",
    "details": "Detailed error information"
  }
}
```

---

## 🔐 Key Features Implemented

### 1. **PSBT Auction Logic**
- ✅ Create PSBT for auction bidding
- ✅ Finalize PSBT for inscription transfer
- ✅ Validate PSBT signatures
- ✅ Broadcast transactions to Bitcoin network

### 2. **Payment Verification Check**
- ✅ Block bids from users without verified payment method
- ✅ Real-time check during bid submission
- ✅ Support for wallet verification and Stripe cards

### 3. **Wallet Integration**
- ✅ Connect Hiro and Xverse wallets
- ✅ Verify wallet ownership through signature
- ✅ Get wallet balance and UTXOs
- ✅ Fetch wallet inscriptions (Ordinals)
- ✅ Sign PSBTs through wallet integration

### 4. **Admin Controls**
- ✅ Manage user KYC status
- ✅ Control payment verification
- ✅ Monitor auction and bidding activities
- ✅ Access comprehensive platform statistics
- ✅ Manual payment marking and inscription transfer

### 5. **Auction Management**
- ✅ Create, update, and end auctions
- ✅ Multiple payment methods (BTC, ETH, Manual)
- ✅ Bid tracking and winner determination
- ✅ Reserve price and buy-now functionality

---

## 🚀 Installation & Setup

1. **Install Dependencies:**
```bash
npm install
```

2. **Setup Environment:**
Copy `src/config/env.example` to `.env` and configure values

3. **Start MongoDB:**
```bash
# Using Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

4. **Run Application:**
```bash
# Development
npm run start:dev

# Production
npm run start:prod
```

---

## 📋 Database Schemas

### User Schema
- KYC status and verification
- Payment method verification
- Wallet address and type
- Role-based access (user/admin)

### Auction Schema
- Auction details and timing
- Payment method configuration
- PSBT and transaction tracking
- Winner and payment status

### Bid Schema
- Bid amount and timing
- PSBT hex for Bitcoin payments
- Bid status and verification

---

**🎯 Milestone 2 Complete:** All core PSBT auction engine APIs are implemented and ready for integration with frontend and wallet extensions! 