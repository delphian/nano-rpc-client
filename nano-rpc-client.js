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
	// Rate limit axios.
	this.axiosLimit = {
		increase: (typeof config['axiosLimit'] != 'undefined') ? config.axiosLimit : 2000,
		delay: 0,
		lastCalled: Date.now()
	};
	this.rpcPost = async function(payload) {
		let promise = new Promise((resolve, reject) => {
			this.axiosLimit.delay += this.axiosLimit.increase;
			setTimeout(() => {
				this.axios.post(this.node.address, payload)
					.then((response) => {
						this.axiosLimit.delay = Math.max(this.axiosLimit.delay - this.axiosLimit.increase, 0);
						this.node.requestsLimit = response.data.requestsLimit;
						this.node.requestsRemaining = response.data.requestsRemaining;
						this.node.requestLimitReset = response.data.requestLimitReset;
						this.fs.appendFile(this.log.file, Date.now() + ": " + JSON.stringify(this.node) + "\n", (err) => {
							if (err)
								console.log(err);
						});
						resolve(response)
					})
					.catch((err) => reject(err));
			}, this.axiosLimit.delay);
			this.axiosLimit.lastCalled = Date.now();
		});
		return promise;
	};
	// account_balance
	this.getAccountBalanceAsync = async function(account) {
		let promise = new Promise((resolve, reject) => {
			this.axios.post(this.node.address, {
				"action": "account_balance",
				"account": account
			}).then(response => {
				resolve(response.data);
			});
		});
		return promise;
	};
	// account_info
	this.getAccountInfoAsync = async function(account, options) {
		let promise = new Promise((resolve, reject) => {
			let json = {
				"action": "account_info",
				"account": account
			};
			if (typeof options !== 'undefined') {
				if (typeof options['receivable'] !== 'undefined')
					json.receivable = options.receivable;
			}
			this.rpcPost(json).then(response => {
				resolve(response.data);
			});
		});
		return promise;
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
		});
		return promise;
	};
	/**
	 * Call RPC node with block_info action.
	 * Read full details of a block on the chain.
	 * @param	{String}	hash		- Unique hash of a block
	 * @param	{Object}	options		- Options directly passed to block_info RPC call.
	 * @returns	{Object}			- Detailed block information.
	 */
	this.getBlockInfoAsync = async function(hash, options) {
		let promise = new Promise((resolve, reject) => {
			let json = {
				"action": "block_info",
				"hash": hash
			};
			if (typeof options !== 'undefined') {
				if (typeof options['json_block'] !== 'undefined')
					json.json_block = options.json_block;
			}
			this.rpcPost(json).then(response => {
				resolve(response.data);
			});
		});
		return promise;
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
			this.rpcPost(json).then(response => {
				resolve(response.data.blocks);
			});
		});
		return promise;
	};
	// accounts_pending
	this.getAccountsPendingAsync = async function(addresses, options) {
		if (!Array.isArray(addresses))
			throw 'addresses must be array';
		let promise = new Promise((resolve, reject) => {
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
			this.rpcPost(json).then(response => {
				resolve(response.data);
			});
		});
		return promise;
	};
	// account_history
	this.getAccountHistoryAsync = async function(account, options) {
		let promise = new Promise((resolve, reject) => {
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
			this.rpcPost(json).then(response => {
				resolve(response.data);
			});
		});
		return promise;
	};
};
