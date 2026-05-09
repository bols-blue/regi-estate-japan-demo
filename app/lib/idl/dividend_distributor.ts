/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/dividend_distributor.json`.
 */
export type DividendDistributor = {
  "address": "62fjZZt7eAxjk5b9YrjVafbDxbtG6VznkcK55JZHX1kX",
  "metadata": {
    "name": "dividendDistributor",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "RegiEstateJapan - Dividend distribution for real estate STs"
  },
  "instructions": [
    {
      "name": "claimDividend",
      "docs": [
        "投資家が自分の按分配当を請求する",
        "",
        "payout = investor_balance / total_supply * dividend_amount"
      ],
      "discriminator": [
        15,
        29,
        207,
        120,
        153,
        178,
        164,
        91
      ],
      "accounts": [
        {
          "name": "investor",
          "writable": true,
          "signer": true
        },
        {
          "name": "distributor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  116,
                  114,
                  105,
                  98,
                  117,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "distributor.mint",
                "account": "distributorState"
              }
            ]
          }
        },
        {
          "name": "investorTokenAccount",
          "docs": [
            "Token-2022 トークンアカウント（KYC 状態・残高の確認に使用）"
          ]
        },
        {
          "name": "claimRecord",
          "docs": [
            "(investor, epoch) ごとの二重請求防止レコード"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "distributor"
              },
              {
                "kind": "account",
                "path": "investor"
              },
              {
                "kind": "account",
                "path": "distributor.epoch",
                "account": "distributorState"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "depositDividend",
      "docs": [
        "発行体が配当を入金し、新しいエポックを開始する",
        "",
        "- amount:       配当総額（lamports）",
        "- total_supply: スナップショット時点の総発行量（トークン枚数）"
      ],
      "discriminator": [
        203,
        10,
        38,
        210,
        120,
        86,
        146,
        87
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "distributor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  116,
                  114,
                  105,
                  98,
                  117,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "distributor.mint",
                "account": "distributorState"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "totalSupply",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "docs": [
        "発行体がディストリビューターを初期化する"
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "distributor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  116,
                  114,
                  105,
                  98,
                  117,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "claimRecord",
      "discriminator": [
        57,
        229,
        0,
        9,
        65,
        62,
        96,
        7
      ]
    },
    {
      "name": "distributorState",
      "discriminator": [
        228,
        86,
        189,
        137,
        118,
        24,
        15,
        127
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "investorNotKyc",
      "msg": "Investor is not KYC approved (token account is frozen)"
    },
    {
      "code": 6001,
      "name": "zeroBalance",
      "msg": "Investor has zero token balance"
    },
    {
      "code": 6002,
      "name": "zeroPayout",
      "msg": "Calculated payout is zero"
    },
    {
      "code": 6003,
      "name": "previousEpochNotFullyClaimed",
      "msg": "Previous epoch still has unclaimed dividends"
    },
    {
      "code": 6004,
      "name": "noDividend",
      "msg": "No dividend has been deposited for this epoch"
    },
    {
      "code": 6005,
      "name": "unauthorized",
      "msg": "Unauthorized: caller is not the distributor authority"
    }
  ],
  "types": [
    {
      "name": "claimRecord",
      "docs": [
        "投資家×エポックごとに作成される請求済みレコード"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "epoch",
            "type": "u64"
          },
          {
            "name": "amount",
            "docs": [
              "受け取った lamports"
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "distributorState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "発行体ウォレット"
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "docs": [
              "Security Token の Mint アドレス"
            ],
            "type": "pubkey"
          },
          {
            "name": "epoch",
            "docs": [
              "現在の配当エポック番号（1始まり）"
            ],
            "type": "u64"
          },
          {
            "name": "totalSupply",
            "docs": [
              "エポック開始時の総発行量スナップショット"
            ],
            "type": "u64"
          },
          {
            "name": "dividendAmount",
            "docs": [
              "エポックの配当総額（lamports）"
            ],
            "type": "u64"
          },
          {
            "name": "claimedAmount",
            "docs": [
              "投資家が請求済みの累計（lamports）"
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
