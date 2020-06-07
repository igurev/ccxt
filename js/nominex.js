'use strict';

//  ---------------------------------------------------------------------------

const Exchange = require ('./base/Exchange');
const { BadRequest,
    RateLimitExceeded,
    AuthenticationError,
    PermissionDenied,
    ArgumentsRequired,
    ExchangeError,
    InvalidAddress,
    BadSymbol,
    InsufficientFunds,
    InvalidOrder,
    OrderNotFound,
    DuplicateOrderId,
    InvalidNonce } = require ('./base/errors');
const { TICK_SIZE } = require ('./base/functions/number');

//  ---------------------------------------------------------------------------

module.exports = class nominex extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'nominex',
            'name': 'Nominex',
            'countries': [ 'SC' ],
            'rateLimit': 1500,
            'certified': false,
            'pro': false,
            'has': {
                'CORS': false,
                'fetchCurrencies': true,
                'fetchOHLCV': true,
                'cancelAllOrders': false,
                'createDepositAddress': true,
                'deposit': false,
                'fetchClosedOrders': true,
                'fetchDepositAddress': true,
                'fetchTradingFees': true,
                'fetchMyTrades': true,
                'fetchOrder': true,
                'fetchOpenOrders': true,
                'fetchTickers': true,
                'fetchDeposits': true,
                'fetchWithdrawals': true,
                'withdraw': true,
            },
            'timeframes': {
                '1m': 'TF1M',
                '5m': 'TF5M',
                '15m': 'TF15M',
                '30m': 'TF30M',
                '1h': 'TF1H',
                '3h': 'TF3H',
                '6h': 'TF6H',
                '12h': 'TF12H',
                '1d': 'TF1D',
                '1w': 'TF7D',
                '2w': 'TF14D',
                '1M': 'TF1MO',
            },
            'urls': {
                'logo': 'https://nominex.io/media/nominex-logo.png',
                'api': {
                    'public': 'https://nominex.io/api/rest/v1',
                    'private': 'https://nominex.io/api/rest/v1/private',
                },
                'demo': {
                    'public': 'https://demo.nominex.io/api/rest/v1',
                    'private': 'https://demo.nominex.io/api/rest/v1/private',
                },
                'www': 'https://nominex.io',
                'doc': [
                    'https://developer.nominex.io/',
                ],
            },
            'api': {
                'public': {
                    'get': [
                        'currencies',
                        'pairs',
                        'ticker/{symbol}',
                        'ticker',
                        'orderbook/{symbol}/A0/{limit}',
                        'candles/{symbol}/{timeframe}',
                        'trades/{symbol}',
                    ],
                },
                'private': {
                    'get': [
                        'trading-fee-rates',
                        'deposits',
                        'withdrawals',
                        'orders',
                        'orders/{id}',
                        'orders/{symbol}',
                        'trades/{symbol}',
                        'wallets',
                        'wallets/{currency}/address',
                        'wallets/{currency}/deposits',
                        'wallets/{currency}/withdrawals',
                    ],
                    'post': [
                        'orders',
                        'wallets/{currency}/address',
                        'withdrawals/{currency}',
                    ],
                    'put': [
                        'orders/{id}',
                    ],
                    'delete': [
                        'orders/{id}',
                    ],
                },
            },
            'fees': {
                'trading': {
                    'tierBased': true,
                    'percentage': true,
                },
                'funding': {
                    'tierBased': false, // true for tier-based/progressive
                },
            },
            'exceptions': {
                '100.2': BadSymbol,
                '101': InvalidNonce,
                '103': AuthenticationError,
                '103.4': InvalidOrder,
                '104.4': InvalidOrder,
                '110.110': RateLimitExceeded,
                '121': PermissionDenied,
                '601': BadRequest,
                '1101': InsufficientFunds,
                '1102': DuplicateOrderId,
                '1106': OrderNotFound,
                '20002': InvalidAddress,
            },
            'precisionMode': TICK_SIZE,
            'options': {
                'tradeSides': {
                    'buy': 'BUY',
                    'sell': 'SELL',
                },
                'paths': {
                    'public': '/api/rest/v1',
                    'private': '/api/rest/v1/private',
                },
            },
        });
    }

    async fetchTradingFees (params = {}) {
        await this.loadMarkets ();
        const response = await this.privateGetTradingFeeRates (params);
        return {
            'info': response,
            'maker': this.safeFloat (response, 'makerFeeFactor') * 100.0,
            'taker': this.safeFloat (response, 'takerFeeFactor') * 100.0,
        };
    }

    async fetchCurrencies (params = {}) {
        const currencies = await this.publicGetCurrencies (params);
        const result = {};
        for (let i = 0; i < currencies.length; ++i) {
            const currency = this.parseCurrency (currencies[i]);
            const currencyCode = this.safeString (currency, 'code');
            result[currencyCode] = currency;
        }
        return result;
    }

    parseCurrency (currency) {
        const code = this.safeString (currency, 'code');
        return {
            'id': code,
            'code': code,
            'name': this.safeString (currency, 'name'),
            'active': true,
            'fee': this.safeFloat (currency, 'withdrawalFee'),
            'precision': this.safeInteger (currency, 'scale'),
            'info': currency,
        };
    }

    async fetchMarkets (params = {}) {
        const pairs = await this.publicGetPairs (params);
        const result = [];
        for (let i = 0; i < pairs.length; i++) {
            const market = pairs[i];
            const id = this.safeString (market, 'name');
            const parts = id.split ('/');
            const baseId = parts[0];
            const quoteId = parts[1];
            const base = this.safeCurrencyCode (baseId);
            const quote = this.safeCurrencyCode (quoteId);
            const symbol = base + '/' + quote;
            const precision = {
                'price': this.safeFloat (market, 'quoteStep'),
                'amount': this.safeFloat (market, 'baseStep'),
            };
            const limits = {
                'amount': {
                    'min': this.safeFloat (market, 'minBaseAmount'),
                    'max': this.safeFloat (market, 'maxBaseAmount'),
                },
                'cost': {
                    'min': this.safeFloat (market, 'minQuoteAmount'),
                    'max': this.safeFloat (market, 'maxQuoteAmount'),
                },
            };
            result.push ({
                'id': id,
                'symbol': symbol,
                'base': base,
                'quote': quote,
                'baseId': baseId,
                'quoteId': quoteId,
                'active': this.safeValue (market, 'active'),
                'precision': precision,
                'limits': limits,
                'info': market,
            });
        }
        return result;
    }

    async fetchBalance (params = {}) {
        await this.loadMarkets ();
        const balanceType = this.safeString (params, 'type', 'SPOT');
        const query = this.omit (params, 'type');
        const response = await this.privateGetWallets (query);
        const result = { 'info': response };
        for (let i = 0; i < response.length; i++) {
            const balance = response[i];
            if (balance['type'] === balanceType) {
                const currencyId = this.safeString (balance, 'currency');
                const code = this.safeCurrencyCode (currencyId);
                if (!(code in result)) {
                    const account = this.account ();
                    account['free'] = this.safeFloat (balance, 'balanceAvailable');
                    account['total'] = this.safeFloat (balance, 'balance');
                    result[code] = account;
                }
            }
        }
        return this.parseBalance (result);
    }

    async fetchOrderBook (symbol, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const request = {
            'symbol': this.marketId (symbol),
            'limit': 100,
        };
        if (limit === 25) {
            request['limit'] = limit;
        }
        const response = await this.publicGetOrderbookSymbolA0Limit (this.extend (request, params));
        const asks = [];
        const bids = [];
        for (let i = 0; i < response.length; ++i) {
            const priceLevel = response[i];
            const side = this.safeString (priceLevel, 'side');
            if (side === 'SELL') {
                asks.push (priceLevel);
            } else {
                bids.push (priceLevel);
            }
        }
        return this.parseOrderBook ({ 'asks': asks, 'bids': bids }, undefined, 'bids', 'asks', 'price', 'amount');
    }

    async fetchTickers (symbols = undefined, params = {}) {
        await this.loadMarkets ();
        const urlParams = {};
        const request = { 'urlParams': urlParams };
        const ids = Object.keys (this.markets);
        if (symbols !== undefined) {
            for (let i = 0; i < symbols.length; ++i) {
                const symbol = symbols[i];
                const market = this.market (symbol);
                ids.push (market['id']);
            }
        }
        urlParams['pairs'] = ids.join (',');
        const response = await this.publicGetTicker (this.extend (request, params));
        const result = {};
        for (let i = 0; i < response.length; i++) {
            const marketId = ids[i];
            const market = this.markets[marketId];
            const ticker = this.parseTicker (response[i], market);
            const symbol = market['symbol'];
            result[symbol] = ticker;
        }
        return result;
    }

    async fetchTicker (symbol, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'],
        };
        const ticker = await this.publicGetTickerSymbol (this.extend (request, params));
        return this.parseTicker (ticker, market);
    }

    parseTicker (ticker, market = undefined) {
        const timestamp = this.safeInteger (ticker, 'timestamp');
        let symbol = undefined;
        if (market !== undefined) {
            symbol = market['symbol'];
        } else if ('pair' in ticker) {
            const marketId = this.safeString (ticker, 'pair');
            if (marketId !== undefined) {
                if (marketId in this.markets_by_id) {
                    market = this.markets_by_id[marketId];
                    symbol = market['symbol'];
                } else {
                    const baseId = marketId.slice (0, 3);
                    const quoteId = marketId.slice (3, 6);
                    const base = this.safeCurrencyCode (baseId);
                    const quote = this.safeCurrencyCode (quoteId);
                    symbol = base + '/' + quote;
                }
            }
        }
        const last = this.safeFloat (ticker, 'price');
        const volume = this.safeFloat (ticker, 'baseVolume');
        const quoteVolume = this.safeFloat (ticker, 'quoteVolume');
        return {
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'high': this.safeFloat (ticker, 'high'),
            'low': this.safeFloat (ticker, 'low'),
            'bid': this.safeFloat (ticker, 'bid'),
            'bidVolume': this.safeFloat (ticker, 'bidSize'),
            'ask': this.safeFloat (ticker, 'ask'),
            'askVolume': this.safeFloat (ticker, 'askSize'),
            'vwap': undefined,
            'open': last - this.safeFloat (ticker, 'dailyChange'),
            'close': last,
            'last': last,
            'previousClose': last - this.safeFloat (ticker, 'dailyChange'),
            'change': this.safeFloat (ticker, 'dailyChange'),
            'percentage': this.safeFloat (ticker, 'dailyChangeP'),
            'average': (volume !== undefined && volume !== 0) ? (quoteVolume / volume) : undefined,
            'baseVolume': volume,
            'quoteVolume': quoteVolume,
            'info': ticker,
        };
    }

    parseOHLCV (ohlcv, market = undefined, timeframe = '1m', since = undefined, limit = undefined) {
        return [
            this.safeInteger (ohlcv, 'timestamp'),
            this.safeFloat (ohlcv, 'open'),
            this.safeFloat (ohlcv, 'high'),
            this.safeFloat (ohlcv, 'low'),
            this.safeFloat (ohlcv, 'close'),
            this.safeFloat (ohlcv, 'volume'),
        ];
    }

    async fetchOHLCV (symbol, timeframe = '1m', since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        if (limit === undefined) {
            limit = 100;
        }
        const market = this.market (symbol);
        const urlParams = {
            'limit': limit,
            'end': this.milliseconds (),
        };
        const request = {
            'symbol': market['id'],
            'timeframe': this.timeframes[timeframe],
            'urlParams': urlParams,
        };
        if (since !== undefined) {
            request['start'] = since;
        }
        const response = await this.publicGetCandlesSymbolTimeframe (this.extend (request, params));
        return this.parseOHLCVs (response, market, timeframe, since, limit);
    }

    parseTrade (trade, market) {
        const id = this.safeString (trade, 'id');
        const timestamp = this.safeInteger (trade, 'timestamp');
        const type = undefined;
        const side = this.safeStringLower (trade, 'side').toLowerCase ();
        let orderId = undefined;
        if ('orderId' in trade) {
            orderId = this.safeString (trade, 'orderId');
        }
        const price = this.safeFloat (trade, 'price');
        const amount = this.safeFloat (trade, 'amount');
        let cost = undefined;
        if (price !== undefined) {
            if (amount !== undefined) {
                cost = price * amount;
            }
        }
        let takerOrMaker = undefined;
        if ('maker' in trade) {
            const maker = this.safeValue (trade, 'maker');
            takerOrMaker = maker ? 'maker' : 'taker';
        }
        const feeAmount = this.safeFloat (trade, 'fee');
        const fee = feeAmount === undefined ? undefined : {
            'cost': feeAmount,
            'currency': this.safeString (trade, 'feeCurrencyCode'),
        };
        return {
            'id': id,
            'info': trade,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': market['symbol'],
            'type': type,
            'order': orderId,
            'side': side,
            'takerOrMaker': takerOrMaker,
            'price': price,
            'amount': amount,
            'cost': cost,
            'fee': fee,
        };
    }

    async fetchTrades (symbol, since = undefined, limit = 50, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const urlParams = {};
        const request = {
            'symbol': market['id'],
            'urlParams': urlParams,
        };
        if (since !== undefined) {
            urlParams['start'] = parseInt (since);
        }
        if (limit !== undefined) {
            urlParams['limit'] = limit;
        }
        const response = await this.publicGetTradesSymbol (this.extend (request, params));
        return this.parseTrades (this.safeValue (response, 'items'), market, since, limit);
    }

    calculateFee (symbol, type, side, amount, price, takerOrMaker = 'taker', params = {}) {
        const market = this.markets[symbol];
        const rate = market[takerOrMaker];
        let cost = amount * rate;
        let key = 'quote';
        if (side === 'sell') {
            cost *= price;
        } else {
            key = 'base';
        }
        const code = market[key];
        const currency = this.safeValue (this.currencies, code);
        if (currency !== undefined) {
            const precision = this.safeInteger (currency, 'precision');
            if (precision !== undefined) {
                cost = parseFloat (this.currencyToPrecision (code, cost));
            }
        }
        return {
            'type': takerOrMaker,
            'currency': market[key],
            'rate': rate,
            'cost': cost,
        };
    }

    async fetchMyTrades (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        if (symbol === undefined) {
            throw new ArgumentsRequired (this.id + ' fetchMyTrades requires a `symbol` argument');
        }
        await this.loadMarkets ();
        const market = this.market (symbol);
        const urlParams = {};
        const request = {
            'symbol': market['id'],
            'urlParams': urlParams,
        };
        if (limit !== undefined) {
            urlParams['limit'] = limit;
        }
        if (since !== undefined) {
            urlParams['start'] = parseInt (since);
        }
        const response = await this.privateGetTradesSymbol (this.extend (request, params));
        return this.parseTrades (this.safeValue (response, 'items'), market, since, limit);
    }

    async createOrder (symbol, type, side, amount, price = undefined, params = {}) {
        await this.loadMarkets ();
        const marketId = this.marketId (symbol);
        const request = {
            'pairName': marketId,
            'side': this.safeString (this.options['tradeSides'], side, side),
            'amount': this.amountToPrecision (symbol, amount),
            'type': this.toUpperCase (type),
            'walletType': this.safeString (params, 'walletType', 'SPOT'),
        };
        if ('clientOrderId' in params) {
            request['cid'] = this.safeInteger (params, 'clientOrderId');
        }
        if (type === 'limit') {
            request['limitPrice'] = this.priceToPrecision (symbol, price);
        }
        const response = await this.privatePostOrders (this.extend (request, params));
        return this.parseOrder (response);
    }

    async editOrder (id, symbol, type, side, amount = undefined, price = undefined, params = {}) {
        await this.loadMarkets ();
        const request = {
            'walletType': this.safeString (params, 'walletType', 'SPOT'),
        };
        if (id !== undefined) {
            request['id'] = id;
        } else if ('clientOrderId' in params) {
            request['id'] = this.safeInteger (params, 'clientOrderId');
            request['urlParams'] = { 'cid': true };
        }
        if (price !== undefined) {
            request['limitPrice'] = this.priceToPrecision (symbol, price);
        }
        if (amount !== undefined) {
            request['amount'] = this.amountToPrecision (symbol, amount);
        }
        if (symbol !== undefined) {
            request['pairName'] = this.marketId (symbol);
        }
        if (side !== undefined) {
            request['side'] = this.safeString (this.options['tradeSides'], side, side);
        }
        if (type !== undefined) {
            request['type'] = this.toUpperCase (type);
        }
        const response = await this.privatePutOrdersId (this.extend (request, params));
        return this.parseOrder (response);
    }

    async cancelOrder (id, symbol = undefined, params = {}) {
        await this.loadMarkets ();
        const request = {};
        if (id !== undefined) {
            request['id'] = parseInt (id);
        } else if ('clientOrderId' in params) {
            request['id'] = this.safeInteger (params, 'clientOrderId');
            request['urlParams'] = { 'cid': true };
        }
        return await this.privateDeleteOrdersId (this.extend (request, params));
    }

    async fetchOrder (id, symbol = undefined, params = {}) {
        await this.loadMarkets ();
        const request = {};
        if (id !== undefined) {
            request['id'] = parseInt (id);
        } else if ('clientOrderId' in params) {
            request['id'] = this.safeInteger (params, 'clientOrderId');
            request['urlParams'] = { 'cid': true };
        }
        const response = await this.privateGetOrdersId (this.extend (request, params));
        return this.parseOrder (response);
    }

    async fetchOpenOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        if (symbol !== undefined) {
            if (!(symbol in this.markets)) {
                throw new ExchangeError (this.id + ' has no symbol ' + symbol);
            }
        }
        const urlParams = {};
        const request = { 'urlParams': urlParams };
        if (since !== undefined) {
            urlParams['start'] = since;
        }
        if (limit !== undefined) {
            urlParams['limit'] = limit;
        }
        urlParams['active'] = true;
        let response = undefined;
        if (symbol !== undefined) {
            const marketId = this.marketId (symbol);
            request['symbol'] = marketId;
            response = await this.privateGetOrdersSymbol (this.extend (request, params));
        } else {
            response = await this.privateGetOrders (this.extend (request, params));
        }
        return this.parseOrders (this.safeValue (response, 'items'), undefined, since, limit);
    }

    async fetchClosedOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const urlParams = {};
        const request = { 'urlParams': urlParams };
        if (since !== undefined) {
            urlParams['start'] = since;
        }
        if (limit !== undefined) {
            urlParams['limit'] = limit;
        }
        urlParams['active'] = false;
        let response = undefined;
        if (symbol !== undefined) {
            const marketId = this.marketId (symbol);
            request['symbol'] = marketId;
            response = await this.privateGetOrdersSymbol (this.extend (request, params));
        } else {
            response = await this.privateGetOrders (this.extend (request, params));
        }
        return this.parseOrders (this.safeValue (response, 'items'), undefined, since, limit);
    }

    parseOrder (order, market = undefined) {
        const side = this.safeStringLower (order, 'side');
        const open = this.safeValue (order, 'active');
        let status = undefined;
        if (open) {
            status = 'open';
        } else {
            status = 'closed';
        }
        let symbol = undefined;
        if (market === undefined) {
            const marketId = this.safeString (order, 'pairName');
            if (marketId !== undefined) {
                if (marketId in this.markets_by_id) {
                    market = this.markets_by_id[marketId];
                }
            }
        }
        if (market !== undefined) {
            symbol = market['symbol'];
        }
        const orderType = this.safeStringLower (order, 'type');
        const timestamp = this.safeInteger (order, 'created');
        const id = this.safeString (order, 'id');
        let lastTradeTimestamp = undefined;
        if (order.amount < order.originalAmount) {
            lastTradeTimestamp = timestamp;
        }
        const originalAmount = this.safeFloat (order, 'originalAmount');
        const amount = this.safeFloat (order, 'amount');
        const filled = originalAmount - amount;
        const resultOrder = {
            'info': order,
            'id': id,
            'clientOrderId': order['cid'],
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'lastTradeTimestamp': lastTradeTimestamp,
            'symbol': symbol,
            'type': orderType,
            'side': side,
            'average': undefined,
            'amount': originalAmount,
            'remaining': amount,
            'filled': filled,
            'status': status,
            'fee': undefined,
            'cost': undefined,
            'trades': undefined,
            'hidden': this.safeValue (order, 'hidden'),
        };
        if ('limitPrice' in order) {
            resultOrder['price'] = this.safeFloat (order, 'limitPrice');
        }
        if ('stopPrice' in order) {
            resultOrder['stopPrice'] = this.safeFloat (order, 'stopPrice');
        }
        if ('trailingPrice' in order) {
            resultOrder['trailingPrice'] = this.safeFloat (order, 'trailingPrice');
        }
        if ('futurePrice' in order) {
            resultOrder['futurePrice'] = this.safeFloat (order, 'futurePrice');
        }
        if ('distance' in order) {
            resultOrder['distance'] = this.safeFloat (order, 'distance');
        }
        return resultOrder;
    }

    async createDepositAddress (code, params = {}) {
        await this.loadMarkets ();
        const request = {
            'currency': this.currency (code).id,
        };
        const response = await this.privatePostWalletsCurrencyAddress (this.extend (request, params));
        const address = this.safeValue (response, 'address');
        const tag = this.safeValue (response, 'tag');
        this.checkAddress (address);
        return {
            'currency': code,
            'address': address,
            'tag': tag,
            'info': response,
        };
    }

    async fetchDepositAddress (code, params = {}) {
        await this.loadMarkets ();
        const request = {
            'currency': code,
            'urlParams': {
                'formatted': true,
            },
        };
        const response = await this.privateGetWalletsCurrencyAddress (this.extend (request, params));
        const address = this.safeValue (response, 'address');
        const tag = this.safeValue (response, 'tag');
        this.checkAddress (address);
        return {
            'currency': this.currency (code).id,
            'address': address,
            'tag': tag,
            'info': response,
        };
    }

    async fetchDeposits (code = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const urlParams = {};
        const request = { 'urlParams': urlParams };
        const start = since !== undefined ? since : 0;
        urlParams['start'] = start;
        urlParams['end'] = this.milliseconds ();
        if (limit !== undefined) {
            urlParams['limit'] = limit;
        }
        let response = undefined;
        if (code !== undefined) {
            request['currency'] = this.currency (code).id;
            response = await this.privateGetWalletsCurrencyDeposits (this.extend (request, params));
        } else {
            response = await this.privateGetDeposits (this.extend (request, params));
        }
        const deposits = this.safeValue (response, 'items');
        for (let i = 0; i < deposits.length; ++i) {
            deposits[i]['type'] = 'DEPOSIT';
        }
        return this.parseTransactions (deposits, undefined, since, limit);
    }

    async fetchWithdrawals (code = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const urlParams = {};
        const request = { 'urlParams': urlParams };
        if (since !== undefined) {
            request['form'] = since;
        }
        const start = since !== undefined ? since : 0;
        urlParams['start'] = start;
        urlParams['end'] = this.milliseconds ();
        if (limit !== undefined) {
            urlParams['limit'] = limit;
        }
        let response = undefined;
        if (code !== undefined) {
            request['currency'] = this.currency (code).id;
            response = await this.privateGetWalletsCurrencyWithdrawals (this.extend (request, params));
        } else {
            response = await this.privateGetWithdrawals (this.extend (request, params));
        }
        const withdrawals = this.safeValue (response, 'items');
        for (let i = 0; i < withdrawals.length; ++i) {
            withdrawals[i]['type'] = 'WITHDRAWAL';
        }
        return this.parseTransactions (withdrawals, undefined, since, limit);
    }

    parseTransaction (transaction, currency = undefined) {
        const timestamp = this.safeInteger (transaction, 'timestamp');
        const updated = this.safeInteger (transaction, 'updated');
        const currencyId = this.safeString (transaction, 'currencyCode');
        const code = this.safeCurrencyCode (currencyId, currency);
        const type = this.safeStringLower (transaction, 'type'); // DEPOSIT or WITHDRAWAL
        const status = this.parseTransactionStatus (this.safeString (transaction, 'status'));
        let feeCost = this.safeFloat (transaction, 'fee');
        if (feeCost !== undefined) {
            feeCost = Math.abs (feeCost);
        }
        return {
            'info': transaction,
            'id': this.safeString (transaction, 'id'),
            'txid': this.safeString (transaction, 'txHash'),
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'address': this.safeString (transaction, 'walletId'), // todo: this is actually the tag for XRP transfers (the address is missing)
            'tag': undefined, // refix it properly for the tag from description
            'type': type,
            'amount': this.safeFloat (transaction, 'amount'),
            'currency': code,
            'status': status,
            'updated': updated,
            'fee': {
                'currency': code,
                'cost': feeCost,
                'rate': undefined,
            },
        };
    }

    parseTransactionStatus (status) {
        const statuses = {
            'PROCESSED': 'pending',
            'CANCELED': 'canceled',
            'COMPLETED': 'ok',
        };
        return this.safeString (statuses, status, status);
    }

    async withdraw (code, amount, address, tag = undefined, params = {}) {
        this.checkAddress (address);
        await this.loadMarkets ();
        const currency = this.currency (code);
        let destination = address;
        if (tag !== undefined) {
            destination = address + ':' + tag;
        }
        const fee = currency.fee;
        const request = {
            'currency': currency.id,
            'amount': this.sum (amount, fee),
            'fee': fee,
            'currencyCode': currency.id,
            'destination': destination,
        };
        const response = await this.privatePostWithdrawalsCurrency (this.extend (request, params));
        return {
            'info': response,
            'id': this.safeString (response, 'id'),
        };
    }

    nonce () {
        return this.milliseconds ();
    }

    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        const request = '/' + this.implodeParams (path, params);
        const query = this.omit (params, this.extractParams (path));
        const apiUrls = this.urls['api'];
        const urlParams = this.safeValue (query, 'urlParams');
        let url = apiUrls[api] + request;
        const urlParamsStr = (urlParams !== undefined) ? this.urlencode (urlParams) : '';
        if (urlParamsStr !== '') {
            url += '?' + urlParamsStr;
        }
        const requestBody = this.omit (query, 'urlParams');
        if (api === 'private') {
            this.checkRequiredCredentials ();
            const nonce = this.nonce ().toString ();
            const urlPath = this.options['paths']['private'] + request;
            let payloadSuffix = '';
            if (method !== 'GET' && method !== 'DELETE') {
                body = this.json (requestBody);
                payloadSuffix = body;
            }
            let payload = '/api' + urlPath + nonce + payloadSuffix;
            payload = this.encode (payload);
            const secret = this.encode (this.secret);
            const signature = this.hmac (payload, secret, 'sha384').toUpperCase ();
            const contentType = 'application/json; charset=UTF-8';
            headers = {
                'Content-Type': contentType,
                'nominex-nonce': nonce,
                'nominex-apikey': this.apiKey,
                'nominex-signature': signature,
            };
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    handleErrors (code, reason, url, method, headers, body, response, requestHeaders, requestBody) {
        if (response === undefined) {
            return;
        }
        if (code >= 400) {
            if (body[0] === '{') {
                const feedback = this.id + ' ' + body;
                if ('code' in response) {
                    const code = this.safeString (response, 'code');
                    this.throwExactlyMatchedException (this.exceptions, code, feedback);
                }
                if ('codes' in response) {
                    const codes = this.safeString (response, 'codes');
                    const code = this.asString (codes[0]);
                    this.throwExactlyMatchedException (this.exceptions, code, feedback);
                }
                throw new ExchangeError (feedback); // unknown message
            } else if (body[0] === '[') {
                const feedback = this.id + ' ' + body;
                const error = response[0];
                const code = this.safeString (error, 'code');
                this.throwExactlyMatchedException (this.exceptions, code, feedback);
                throw new ExchangeError (feedback); // unknown message
            }
        }
    }
};
