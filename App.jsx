import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';

// --- Global Variables (Provided by Canvas Environment) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'trade-coin-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Simulated Data for Display (Replace with API calls later) ---
const FIAT_CURRENCY = 'USD';
const SIMULATED_COIN_PRICE = 68500.00; // Fake Bitcoin Price
const MIN_WITHDRAWAL_AMOUNT = 100;

// Helper to format currency
const formatCurrency = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: FIAT_CURRENCY, maximumFractionDigits: 2 }).format(amount);
const formatCoin = (amount) => parseFloat(amount).toFixed(4);

// Utility function to generate a placeholder Bitcoin wallet address
const generatePlaceholderAddress = () => {
    // This is NOT a real Bitcoin address and must be replaced with a secure system later
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let address = '1';
    for (let i = 0; i < 33; i++) {
        address += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return address;
};
const ADMIN_WALLET_ADDRESS = generatePlaceholderAddress();

// Modal States: 'deposit', 'buy', 'sell', 'withdraw', null
const App = () => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [userBalance, setUserBalance] = useState({ fiat: 1000.00, coin: 0.00 });
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [modal, setModal] = useState(null);
    const [tradeAmount, setTradeAmount] = useState(10);
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // 1. Initialize Firebase and Authentication
    useEffect(() => {
        if (!firebaseConfig) {
            console.error("Firebase config is missing.");
            return;
        }

        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const firebaseAuth = getAuth(app);

        setDb(firestore);
        setAuth(firebaseAuth);

        const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                // Sign in anonymously if no token is available
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(firebaseAuth, initialAuthToken);
                    } else {
                        await signInAnonymously(firebaseAuth);
                    }
                } catch (error) {
                    console.error("Firebase Authentication Error:", error);
                }
            }
            setIsAuthReady(true);
        });

        return () => unsubscribe();
    }, []);

    // 2. Firestore Data Listener
    useEffect(() => {
        if (!db || !userId || !isAuthReady) return;

        // Path for private user data: /artifacts/{appId}/users/{userId}/balances/user
        const balanceDocRef = doc(db, 'artifacts', appId, 'users', userId, 'balances', 'user');

        // Setup real-time listener
        const unsubscribe = onSnapshot(balanceDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setUserBalance({
                    fiat: data.fiat || 0.00,
                    coin: data.coin || 0.00
                });
            } else {
                // Initialize default balance if document doesn't exist
                setUserBalance({ fiat: 1000.00, coin: 0.00 });
                // Attempt to create the document
                setDoc(balanceDocRef, { fiat: 1000.00, coin: 0.00 }).catch(err => console.error("Error initializing balance:", err));
            }
            setMessage('');
        }, (error) => {
            console.error("Firestore listen failed:", error);
            setMessage("Error connecting to database.");
        });

        return () => unsubscribe();
    }, [db, userId, isAuthReady]);

    // Function to update the balance in Firestore
    const updateBalance = useCallback(async (newFiat, newCoin, successMessage) => {
        if (!db || !userId) return;
        setIsLoading(true);
        const balanceDocRef = doc(db, 'artifacts', appId, 'users', userId, 'balances', 'user');
        try {
            await setDoc(balanceDocRef, { fiat: newFiat, coin: newCoin });
            setMessage(successMessage);
        } catch (e) {
            console.error("Error updating balance:", e);
            setMessage("Transaction failed due to a database error.");
        } finally {
            setIsLoading(false);
            setModal(null); // Close modal on success/failure
        }
    }, [db, userId]);


    // --- Trading Logic ---

    // Deposit: Increases Fiat Balance (Simulates successful Bitcoin payment)
    const handleSimulatedDeposit = () => {
        if (tradeAmount <= 0 || isNaN(tradeAmount)) {
            return setMessage("Please enter a valid amount.");
        }
        const newFiat = userBalance.fiat + tradeAmount;
        updateBalance(newFiat, userBalance.coin, `Deposit of ${formatCurrency(tradeAmount)} successful! Your new balance is ${formatCurrency(newFiat)}.`);
    };

    // Buy: Exchanges Fiat for Coin
    const handleBuy = () => {
        if (tradeAmount <= 0 || isNaN(tradeAmount)) {
            return setMessage("Please enter a valid amount.");
        }

        const costInFiat = tradeAmount;
        const coinsReceived = costInFiat / SIMULATED_COIN_PRICE;

        if (userBalance.fiat < costInFiat) {
            return setMessage("Error: Insufficient USD balance to complete the purchase.");
        }

        const newFiat = userBalance.fiat - costInFiat;
        const newCoin = userBalance.coin + coinsReceived;

        updateBalance(newFiat, newCoin, `Purchase of ${formatCoin(coinsReceived)} BTC successful!`);
    };

    // Sell: Exchanges Coin for Fiat
    const handleSell = () => {
        if (tradeAmount <= 0 || isNaN(tradeAmount)) {
            return setMessage("Please enter a valid amount.");
        }

        // Calculate coins to sell based on USD amount requested
        const coinsToSell = tradeAmount / SIMULATED_COIN_PRICE;

        if (userBalance.coin < coinsToSell) {
            return setMessage("Error: Insufficient BTC balance to complete the sale.");
        }

        const fiatReceived = tradeAmount;
        const newFiat = userBalance.fiat + fiatReceived;
        const newCoin = userBalance.coin - coinsToSell;

        updateBalance(newFiat, newCoin, `Sale successful. You received ${formatCurrency(fiatReceived)}.`);
    };

    // Withdraw: Reduces Coin Balance (Only if >= MIN_WITHDRAWAL_AMOUNT)
    const handleWithdraw = () => {
        if (userBalance.coin < MIN_WITHDRAWAL_AMOUNT) {
            return setMessage(`Withdrawal failed: Minimum withdrawal is ${MIN_WITHDRAWAL_AMOUNT} BTC. You currently have ${formatCoin(userBalance.coin)} BTC.`);
        }

        // Withdraws the entire eligible amount (could be updated for partial withdrawals later)
        const withdrawalAmount = userBalance.coin;
        const newCoin = 0; // Set coin balance to zero after full withdrawal

        updateBalance(userBalance.fiat, newCoin, `Withdrawal of ${formatCoin(withdrawalAmount)} BTC initiated! (Simulated)`);
    };

    // --- Components & UI ---

    const renderChartPlaceholder = () => (
        <div className="bg-gray-800 p-4 rounded-xl shadow-lg border border-yellow-500/30">
            <h3 className="text-xl font-semibold mb-3 text-yellow-400">Bitcoin/USD Real-Time Chart (Simulated)</h3>
            <p className="text-4xl font-extrabold text-white mb-2">{formatCurrency(SIMULATED_COIN_PRICE)}</p>
            <p className="text-sm text-gray-400">Real-time data integration is needed here. This data is simulated.</p>
            <div className="h-40 w-full bg-yellow-900/50 rounded-lg flex items-center justify-center mt-3">
                <p className="text-gray-500">Candlestick Chart Placeholder</p>
            </div>
        </div>
    );

    const Modal = ({ type, onClose }) => {
        const [amount, setAmount] = useState(100);

        let title, actionText, actionHandler, inputType = 'number';
        let bodyContent;

        switch (type) {
            case 'deposit':
                title = 'Deposit Funds';
                actionText = 'Deposit (Simulated)';
                actionHandler = () => { setTradeAmount(amount); handleSimulatedDeposit(); };
                bodyContent = (
                    <div>
                        <p className="text-sm text-gray-400 mb-3">To simulate a real deposit, please send BTC to the wallet address below. Once sent, enter the amount you wish to credit in {FIAT_CURRENCY}.</p>
                        <div className="p-3 bg-gray-700 rounded-lg break-words text-yellow-300 font-mono text-xs mb-4">
                            {ADMIN_WALLET_ADDRESS}
                        </div>
                        <label className="block mb-2 text-sm font-medium text-white">Amount to Deposit ({FIAT_CURRENCY}):</label>
                        <input
                            type={inputType}
                            value={amount}
                            onChange={(e) => setAmount(parseFloat(e.target.value))}
                            className="w-full p-3 bg-gray-700 border border-yellow-500/50 rounded-lg text-white placeholder-gray-500 focus:ring-yellow-500 focus:border-yellow-500"
                            placeholder="Enter amount"
                        />
                    </div>
                );
                break;
            case 'buy':
                title = 'Buy Bitcoin';
                actionText = 'Confirm Buy';
                actionHandler = () => { setTradeAmount(amount); handleBuy(); };
                bodyContent = (
                    <div>
                        <p className="text-sm text-gray-400 mb-3">Current Price: {formatCurrency(SIMULATED_COIN_PRICE)} / BTC</p>
                        <label className="block mb-2 text-sm font-medium text-white">Amount of {FIAT_CURRENCY} to spend:</label>
                        <input
                            type={inputType}
                            value={amount}
                            onChange={(e) => setAmount(parseFloat(e.target.value))}
                            className="w-full p-3 bg-gray-700 border border-yellow-500/50 rounded-lg text-white placeholder-gray-500 focus:ring-yellow-500 focus:border-yellow-500"
                            placeholder="USD Amount"
                        />
                        <p className="mt-2 text-sm text-gray-400">You will receive approximately: {formatCoin(amount / SIMULATED_COIN_PRICE)} BTC</p>
                    </div>
                );
                break;
            case 'sell':
                title = 'Sell Bitcoin';
                actionText = 'Confirm Sell';
                actionHandler = () => { setTradeAmount(amount); handleSell(); };
                bodyContent = (
                    <div>
                        <p className="text-sm text-gray-400 mb-3">Current Price: {formatCurrency(SIMULATED_COIN_PRICE)} / BTC</p>
                        <label className="block mb-2 text-sm font-medium text-white">Amount of {FIAT_CURRENCY} you want to receive:</label>
                        <input
                            type={inputType}
                            value={amount}
                            onChange={(e) => setAmount(parseFloat(e.target.value))}
                            className="w-full p-3 bg-gray-700 border border-yellow-500/50 rounded-lg text-white placeholder-gray-500 focus:ring-yellow-500 focus:border-yellow-500"
                            placeholder="USD Amount"
                        />
                        <p className="mt-2 text-sm text-gray-400">This will cost you approximately: {formatCoin(amount / SIMULATED_COIN_PRICE)} BTC</p>
                    </div>
                );
                break;
            case 'withdraw':
                title = 'Withdraw Bitcoin';
                actionText = 'Withdraw All BTC (Simulated)';
                actionHandler = handleWithdraw;
                bodyContent = (
                    <div>
                        <p className="text-sm text-yellow-300 font-semibold mb-3">Current BTC Balance: {formatCoin(userBalance.coin)}</p>
                        <p className={`p-3 rounded-lg text-sm mb-4 ${userBalance.coin >= MIN_WITHDRAWAL_AMOUNT ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                            Minimum withdrawal amount is **{MIN_WITHDRAWAL_AMOUNT} BTC**.
                        </p>
                        <p className="text-sm text-gray-400">
                            {userBalance.coin < MIN_WITHDRAWAL_AMOUNT
                                ? `You need ${formatCoin(MIN_WITHDRAWAL_AMOUNT - userBalance.coin)} more BTC to withdraw.`
                                : "You are eligible to withdraw your entire balance."
                            }
                        </p>
                    </div>
                );
                break;
            default:
                return null;
        }

        return (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-900 w-full max-w-md p-6 rounded-xl shadow-2xl border border-yellow-600/50">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-bold text-yellow-400">{title}</h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white text-xl p-1 leading-none">&times;</button>
                    </div>
                    <div className="mb-6">
                        {bodyContent}
                    </div>
                    <div className="flex justify-end space-x-3">
                        <button onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-700 text-white hover:bg-gray-600">
                            Cancel
                        </button>
                        <button
                            onClick={actionHandler}
                            disabled={isLoading || (type === 'withdraw' && userBalance.coin < MIN_WITHDRAWAL_AMOUNT)}
                            className="px-4 py-2 text-sm font-semibold rounded-lg bg-yellow-600 text-gray-900 hover:bg-yellow-500 disabled:bg-gray-500 disabled:cursor-not-allowed transition duration-200"
                        >
                            {isLoading ? 'Processing...' : actionText}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    if (!isAuthReady) {
        return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-yellow-500"></div>
            <p className="ml-3">Connecting to Secure Trading Platform...</p>
        </div>;
    }

    const currentUserIdDisplay = userId || "Anon-User";

    return (
        <div className="min-h-screen bg-gray-900 text-white font-sans p-4 sm:p-8">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
                * { font-family: 'Inter', sans-serif; }
            `}</style>

            {/* Header and Balance Display */}
            <header className="mb-8 text-center">
                <h1 className="text-4xl sm:text-5xl font-extrabold text-yellow-400 tracking-tight">
                    Crypto Trading Dashboard
                </h1>
                <p className="text-md text-gray-400 mt-2">Welcome, Trader: <span className="text-xs break-all">{currentUserIdDisplay}</span></p>

                <div className="mt-6 p-4 sm:p-6 bg-gray-800 rounded-xl shadow-lg border-b-4 border-yellow-600">
                    <div className="flex justify-around items-center space-x-4">
                        <div className="text-left">
                            <p className="text-lg text-gray-300">USD Balance</p>
                            <p className="text-3xl font-bold text-green-400">{formatCurrency(userBalance.fiat)}</p>
                        </div>
                        <div className="text-left">
                            <p className="text-lg text-gray-300">BTC Balance</p>
                            <p className="text-3xl font-bold text-yellow-300">{formatCoin(userBalance.coin)} BTC</p>
                        </div>
                    </div>
                    {message && (
                        <div className="mt-4 p-2 bg-yellow-900/30 text-yellow-300 rounded-lg text-sm font-medium">
                            {message}
                        </div>
                    )}
                </div>
            </header>

            {/* Trading Buttons */}
            <div className="flex justify-center space-x-3 mb-8">
                <button onClick={() => setModal('deposit')} className="px-5 py-3 text-sm font-bold rounded-lg bg-green-600 text-white hover:bg-green-500 shadow-md shadow-green-900/50 transition duration-150 transform hover:scale-105">
                    Deposit
                </button>
                <button onClick={() => setModal('buy')} className="px-5 py-3 text-sm font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-500 shadow-md shadow-blue-900/50 transition duration-150 transform hover:scale-105">
                    Buy
                </button>
                <button onClick={() => setModal('sell')} className="px-5 py-3 text-sm font-bold rounded-lg bg-red-600 text-white hover:bg-red-500 shadow-md shadow-red-900/50 transition duration-150 transform hover:scale-105">
                    Sell
                </button>
                <button onClick={() => setModal('withdraw')} className="px-5 py-3 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-900/50 transition duration-150 transform hover:scale-105">
                    Withdraw
                </button>
            </div>

            {/* Main Content: Chart and Information */}
            <main className="space-y-8">
                {renderChartPlaceholder()}

                {/* Crypto Market Overview Placeholder */}
                <div className="bg-gray-800 p-4 rounded-xl shadow-lg border border-yellow-500/30">
                    <h3 className="text-xl font-semibold mb-4 text-white">Market Overview (Top 3 Coins)</h3>
                    <div className="space-y-3">
                        {[
                            { name: 'Bitcoin (BTC)', price: SIMULATED_COIN_PRICE, change: '+2.5%' },
                            { name: 'Ethereum (ETH)', price: 3450.00, change: '-1.1%' },
                            { name: 'Cardano (ADA)', price: 0.45, change: '+5.0%' },
                        ].map((coin) => (
                            <div key={coin.name} className="flex justify-between items-center p-3 bg-gray-700 rounded-lg">
                                <span className="font-medium text-white">{coin.name}</span>
                                <div className="text-right">
                                    <span className="block font-bold text-lg">{formatCurrency(coin.price)}</span>
                                    <span className={`text-sm ${coin.change.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>{coin.change}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* About Bitcoin Section */}
                <div className="bg-gray-800 p-4 rounded-xl shadow-lg border border-yellow-500/30">
                    <h3 className="text-xl font-semibold mb-3 text-white">What is Bitcoin?</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">
                        Bitcoin is a decentralized digital currency, without a central bank or single administrator, that can be sent from user to user on the peer-to-peer bitcoin network without the need for intermediaries. Transactions are verified by network nodes through cryptography and recorded in a public distributed ledger called a blockchain.
                    </p>
                </div>
            </main>

            {/* Render the active Modal */}
            {modal && <Modal type={modal} onClose={() => setModal(null)} />}
        </div>
    );
};

export default App;

