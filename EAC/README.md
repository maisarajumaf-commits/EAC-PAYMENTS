# Blockchain-Based Cross-Border Payment System

## Blockchain Architecture Overview

This project adds a **real blockchain layer** on top of the ASP.NET + MSSQL backend to provide:

- **Immutability**: Transactions once recorded cannot be altered
- **Tamper Detection**: Any modification to a transaction is automatically detected
- **Transparency**: All parties can verify transaction history
- **Decentralized Ledger**: Multiple nodes (banks) maintain the same ledger

---

## Project Structure

```
CrossBorderPaymentSystem/
├── Blockchain.Core/                    # Blockchain implementation (C# Class Library)
│   ├── Block.cs                        # Individual block structure
│   ├── Blockchain.cs                   # The blockchain ledger
│   ├── Transaction.cs                  # Transaction data model
│   ├── CryptoHelper.cs                 # Hashing & cryptographic utilities
│   ├── MerkleTree.cs                   # Merkle tree for transaction verification
│   ├── SmartContract.cs                # Transaction validation rules
│   └── BlockchainNode.cs               # Peer-to-peer node communication
│
├── CrossBorderPayment.Web/             # ASP.NET Web Application (Frontend + Backend)
│   ├── Controllers/
│   │   ├── BankController.cs           # Bank module endpoints
│   │   ├── CustomerController.cs       # Customer module endpoints
│   │   └── BlockchainController.cs     # Blockchain query endpoints
│   ├── Models/
│   │   ├── Bank.cs
│   │   ├── Customer.cs
│   │   ├── PaymentTransaction.cs
│   │   └── IntermediaryBank.cs
│   ├── Views/
│   │   ├── Bank/
│   │   │   ├── Register.cshtml
│   │   │   ├── Login.cshtml
│   │   │   ├── Dashboard.cshtml
│   │   │   ├── Customers.cshtml
│   │   │   ├── Transactions.cshtml
│   │   │   ├── IntermediaryBank.cshtml
│   │   │   └── Feedback.cshtml
│   │   └── Customer/
│   │       ├── Register.cshtml
│   │       ├── Login.cshtml
│   │       ├── Profile.cshtml
│   │       ├── ConnectBank.cshtml
│   │       ├── NewTransaction.cshtml
│   │       ├── MyTransactions.cshtml
│   │       └── Feedback.cshtml
│   └── wwwroot/
│       ├── css/
│       │   └── style.css
│       └── js/
│           ├── blockchain.js
│           ├── transactions.js
│           └── main.js
│
├── CrossBorderPayment.Data/            # Data Access Layer
│   ├── ApplicationDbContext.cs         # EF Core DbContext
│   ├── Repositories/
│   │   ├── BankRepository.cs
│   │   ├── CustomerRepository.cs
│   │   └── TransactionRepository.cs
│   └── BlockchainStorage.cs            # Persist blockchain to MSSQL
│
└── CrossBorderPayment.Tests/           # Unit Tests
    ├── BlockchainTests.cs
    └── CryptoHelperTests.cs
```

---

## How the Blockchain Works

### 1. Block Structure
Each block contains:
- **Block Index**: Sequential number (genesis = 0)
- **Timestamp**: When the block was created
- **Transactions**: List of cross-border payments in this block
- **Previous Hash**: Hash of the previous block (creates the chain)
- **Nonce**: Proof-of-work value
- **Block Hash**: SHA-256 hash of all block data

### 2. Transaction Flow
```
Customer initiates payment
    ↓
ASP.NET Controller receives request
    ↓
SmartContract validates (sufficient balance, currency rules)
    ↓
If intermediary bank needed → route through intermediary
    ↓
Transaction added to pending pool
    ↓
Block created with pending transactions
    ↓
Proof-of-Work mining (simplified for performance)
    ↓
Block added to blockchain
    ↓
Hash stored in MSSQL for persistence
    ↓
Customer/Bank can verify transaction integrity
```

### 3. Tamper Detection
- Every block's hash depends on its data AND the previous block's hash
- If anyone modifies a transaction:
  - That block's hash changes
  - All subsequent block hashes become invalid
  - The chain breaks → tampering is detected
- Status column shows: "Verified" | "Tampered" | "Pending"

---

## Setup Instructions

### Prerequisites
- Visual Studio 2022
- .NET 6.0 or later SDK
- SQL Server 2019+ / SQL Server Management Studio
- Node.js (for any frontend tooling)

### Steps
1. Open `CrossBorderPaymentSystem.sln` in Visual Studio
2. Update the connection string in `appsettings.json`
3. Run `dotnet ef database update` to create MSSQL tables
4. Build and run the solution
5. The blockchain initializes automatically on first run

---

## API Endpoints

### Bank Module
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bank/register` | POST | Register a new bank |
| `/api/bank/login` | POST | Bank login |
| `/api/bank/customers` | GET | View all customers |
| `/api/bank/transactions` | GET | View all transactions |
| `/api/bank/intermediary` | POST | Connect to intermediary bank |
| `/api/bank/feedback` | GET | View customer feedback |

### Customer Module
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/customer/register` | POST | Register a new customer |
| `/api/customer/login` | POST | Customer login |
| `/api/customer/profile` | GET | View profile details |
| `/api/customer/connect-bank` | POST | Connect to a bank |
| `/api/customer/transaction` | POST | Make a cross-border payment |
| `/api/customer/transactions` | GET | View own transactions |
| `/api/customer/feedback` | POST | Submit feedback |

### Blockchain Module
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/blockchain/chain` | GET | Get full blockchain |
| `/api/blockchain/verify` | POST | Verify a specific transaction |
| `/api/blockchain/validate` | GET | Validate entire chain integrity |
| `/api/blockchain/pending` | GET | View pending transactions |

---

## Database Schema (MSSQL)

### Banks Table
```sql
BankID (PK), BankName, SwiftCode, Country, Currency, 
AccountNumber, RegistrationDate, Status
```

### Customers Table
```sql
CustomerID (PK), FirstName, LastName, Email, Phone, 
BankID (FK), AccountNumber, NationalID, Address, 
RegistrationDate, Status
```

### Transactions Table
```sql
TransactionID (PK), SenderID (FK), ReceiverID (FK), 
SenderBankID (FK), ReceiverBankID (FK), 
IntermediaryBankID (FK), Amount, Currency, 
ExchangeRate, Fee, Description, TransactionDate, 
Status, BlockHash, TransactionHash, IsTampered
```

### Blocks Table
```sql
BlockID (PK), Index, Timestamp, PreviousHash, 
CurrentHash, Nonce, MerkleRoot, TransactionCount
```

### Feedback Table
```sql
FeedbackID (PK), CustomerID (FK), BankID (FK), 
Message, Rating, SubmittedDate, Status
```
