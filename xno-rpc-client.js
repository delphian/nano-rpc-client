exports.nRpc = function(config) {
	this.config = config;
	this.axios = (typeof config['axios'] != 'undefined') ? config.axios : require('axios');
	this.fs = (typeof config['fs'] != 'undefined') ? config.fs : require('fs');
	this.node = {
		address: config.node,
		requestsLimit: null,
		requestsRemaining: null,
		requestLimitReset: null
	};
	this.log = {
		enabled: true,
		file: (typeof config['logFile'] != 'undefined') ? config.logFile : './nRpc.log'
	};
	this.rpcPost = async function(payload) {
		let promise = new Promise(async (resolve, reject) => {
			this.axios.post(this.node.address, payload)
				.then((response) => {
					this.node.requestsLimit = response.data.requestsLimit;
					this.node.requestsRemaining = response.data.requestsRemaining;
					this.node.requestLimitReset = response.data.requestLimitReset;
					this.fs.appendFile(this.log.file, Date.now() + ": " + JSON.stringify(payload) + ": " + JSON.stringify(this.node) + "\n", (err) => {
						if (err)
							throw err;
					});
					resolve(response.data)
				})
				.catch((err) => {
					if (typeof err['response'] != 'undefined' && typeof err.response['data'] != 'undefined') {
						this.fs.appendFile(this.log.file, Date.now() + ": " + JSON.stringify(payload) + ": " + err.response.data + "\n", (err) => { });
						reject(err.response.data);
					} else if (typeof err['response'] != 'undefined') {
						this.fs.appendFile(this.log.file, Date.now() + ": " + JSON.stringify(payload) + ": " + err.response + "\n", (err) => { });
						reject(err.response);
					} else {
						this.fs.appendFile(this.log.file, Date.now() + ": " + JSON.stringify(payload) + ": " + err + "\n", (err) => { });
						reject(err);
					}
				});
		});
		return promise;
	};
	// account_balance
	this.getAccountBalanceAsync = async function(account) {
		return this.rpcPost(this.node.address, {
			"action": "account_balance",
			"account": account
		});
	};
	// work_generate
	this.workGenerate = async function(hash, difficulty, options) {
		let json = {
			"action": "work_generate",
			"hash": hash
		};
		if (typeof options !== 'undefined') {
		}
		return this.rpcPost(json);
	};
	// work_validate
	this.workValidate = async function(hash, work, difficulty, options) {
		let json = {
			"action": "work_validate",
			"hash": hash,
			"work": work,
			"difficulty": difficulty
		};
		if (typeof options !== 'undefined') {
		}
		return this.rpcPost(json);
	};
	// process
	this.processAsync = async function(subtype, psuedoBlock, options) {
		let json = {
			"action": "process",
			"json_block": true,
			"subtype": subtype,
			"block": psuedoBlock
		};
		if (typeof options !== 'undefined') {
		}
		return this.rpcPost(json);
	};
	// account_info
	this.getAccountInfoAsync = async function(account, options) {
		let json = {
			"action": "account_info",
			"account": account
		};
		if (typeof options !== 'undefined') {
			if (typeof options['receivable'] !== 'undefined')
				json.receivable = options.receivable;
		}
		return this.rpcPost(json);
	};
	/**
	 * Get detailed information on all receivable (pending) transactions.
	 * @param	{Array}		accounts	- Multiple account addresses.
	 * @param	{Object}	options		- Format results according to properties.
	 * @param	{String}	options.sort	- 'ascending'  - sort by local_timestamp ascending.
	 *					  	  'descending' - sort by local_timestamp descending.
	 * @returns	{Object}			- Multiple accounts with multiple block details. Keyed by account address.
	 */
	this.getReceivableBlocksInfoAsync = async function(accounts, options) {
		let promise = new Promise(async (resolve, reject) => {
			try {
				let accountsBlocksInfo = {};
				for (let x = 0; x < accounts.length; x++) {
					accountsBlocksInfo[accounts[x]] = [];
				}
			        let pending = await this.getAccountsPendingAsync(accounts);
				if (pending.blocks != '') {
					let hashes = [];
					for (let x = 0; x < accounts.length; x++) {
						hashes = hashes.concat(pending.blocks[accounts[x]]);
					}
        				let blocksInfo = await this.getBlocksInfoAsync(hashes, { json_block: true, source: true, pending: true });
					let hashKeys = Object.keys(blocksInfo);
					for (let x = 0; x < hashKeys.length; x++) {
						let hash = hashKeys[x];
						let indexAccount = blocksInfo[hash].contents.link_as_account;
						blocksInfo[hash].block_hash = hash;
						accountsBlocksInfo[indexAccount].push(blocksInfo[hash]);
						if (typeof options != 'undefined') {
							if (typeof options['sort'] !== 'undefined' && options.sort == 'descending')
								accountsBlocksInfo[indexAccount].sort((a, b) => (a.local_timestamp < b.local_timestamp) ? 1 : -1);
							if (typeof options['sort'] !== 'undefined' && options.sort == 'ascending')
								accountsBlocksInfo[indexAccount].sort((a, b) => (a.local_timestamp > b.local_timestamp) ? 1 : -1);
						}
					}
				}
				resolve(accountsBlocksInfo);
			} catch (err) {
				reject(err);
			}
		});
		return promise;
	};
	/**
	 * Call RPC node with block_info action.
	 * Read full details of a block on the chain.
	 * @param	{String}	hash			- Unique hash of a block
	 * @param	{Object}	options			- Options directly passed to block_info RPC call.
	 * @param	{bool}		options.json_block		- Format contents property as json.
	 * @returns	{Object}				- Detailed block information.
	 */
	this.getBlockInfoAsync = async function(hash, options) {
		let json = {
			"action": "block_info",
			"hash": hash
		};
		if (typeof options !== 'undefined') {
			if (typeof options['json_block'] !== 'undefined')
				json.json_block = options.json_block;
		}
		return this.rpcPost(json);
	};
        /**
         * Call RPC node with blocks_info action.
         * Read full details of multiple blocks on the chain.
         * @param       {String[]}	hash            - Unique hashes of blocks.
         * @param       {Object}        options         - Options directly passed to blocks_info RPC call.
         * @returns     {Object[]}                      - Multiple block detailed information.
         */
	this.getBlocksInfoAsync = async function(hashes, options) {
		if (!Array.isArray(hashes))
			throw 'hashes must be array';
		let promise = new Promise((resolve, reject) => {
			let json = {
				"action": "blocks_info",
				"hashes": hashes
			};
			if (typeof options !== 'undefined') {
				if (typeof options['json_block'] !== 'undefined')
					json.json_block = options.json_block;
				if (typeof options['source'] !== 'undefined')
					json.source = options.source;
				if (typeof options['pending'] !== 'undefined')
					json.pending = options.pending;
			}
			this.rpcPost(json)
			.then(data => {
				resolve(data.blocks);
			})
			.catch(err => { reject(err); });
		});
		return promise;
	};
	// accounts_pending
	this.getAccountsPendingAsync = async function(addresses, options) {
		if (!Array.isArray(addresses))
			throw 'addresses must be array';
		let json = {
			"action": "accounts_pending",
			"accounts": addresses
		};
		if (typeof options !== 'undefined') {
			if (typeof options['count'] !== 'undefined')
				json.count = options.count;
	                if (typeof options['threshold'] !== 'undefined')
        	       	        json.threshold = options.threshold;
		}
		return this.rpcPost(json);
	};
	// account_history
	this.getAccountHistoryAsync = async function(account, options) {
		let json = {
			"action": "account_history",
			"account": account
		};
		if (typeof options !== 'undefined') {
			if (typeof options['raw'] !== 'undefined')
				json.raw = options.raw;
			if (typeof options['count'] !== 'undefined')
				json.count = options.count;
		}
		return this.rpcPost(json);
	};
};
