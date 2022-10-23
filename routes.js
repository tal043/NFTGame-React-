const web3 = require("@solana/web3.js");
const bs58 = require("bs58");
const express = require("express");
const Joi = require("@hapi/joi");
const CryptoJS = require("crypto-js");

const {
  insertItem,
  getItems,
  updateQuantity,
  insertBoard,
  checkMine,
  saveHistory,
  getHistory,
  getBoard,
  deposit,
  checkDeposit,
  deleteDeposit,
  chceckAlreadyDeposit,
  saveUser,
  getUserData,
  setAvatar,
  getAllHistory,
  getTodayHistory,
  getWeekHistory,
  userFailResetAll,
  userClickedCoin,
  stopGame,
} = require("./db");
const { request } = require("express");

const router = express.Router();

const itemSchema = Joi.object().keys({
  name: Joi.string(),
  quantity: Joi.number().integer().min(0),
});

const checkingBoardSchema = Joi.object().keys({
  walletAddress: Joi.string(),
  boardNum: Joi.number().integer().min(0),
});

const depositSchema = Joi.object().keys({
  walletAddress: Joi.string(),
  bettingAmount: Joi.number(),
  signature: Joi.string(),
});

const boardSchema = Joi.object().keys({
  boardString: Joi.string(),
  walletAddress: Joi.string(),
  mineAmount: Joi.number().min(1).max(24),
});

const historySchema = Joi.object().keys({
  walletAddress: Joi.string(),
  game: Joi.string().min(1),
  player: Joi.string().min(1),
  wager: Joi.number(),
  payout: Joi.number(),
});

router.post("/api/play", async (req, res) => {
  const { walletAddress, mineAmount, bettingAmount } = req.body;

  let depositResult = await chceckAlreadyDeposit(req.body);
  if (!depositResult.bettingAmount == bettingAmount) {
    res.json({ result: "not deposited" });
    res.status(500).end();
    return;
  }

  const board = [];
  for (let k = 0; k < 25; k++) {
    board.push(0);
  }
  const board_clicked = [];
  for (let k = 0; k < 25; k++) {
    board_clicked.push(0); // 0: nonClicked, 1:clicked
  }

  for (let j = 0; j < mineAmount; j++) {
    while (true) {
      let temp = Math.floor(Math.random() * 25);
      if (board[temp] === 1) continue;
      board[temp] = 1;
      break;
    }
  }

  const boardString = JSON.stringify(board);
  const boardClickedString = JSON.stringify(board_clicked);
  const boardObject = {
    boardString,
    boardClickedString,
    walletAddress,
    mineAmount,
  };

  insertBoard(boardObject)
    .then(() => {
      res.status(200).end();
    })
    .catch((err) => {
      res.status(500).end();
    });
  res.json({ walletAddress });
});

router.post("/api/saveUser", async (req, res) => {
  const { walletAddress, userName } = req.body;
  const data = {
    walletAddress,
    userName,
  };
  saveUser(data)
    .then(() => {
      res.json({ result: "success" });
      res.status(200).end();
    })
    .catch((err) => {
      res.status(400).end();
    });
});

router.post("/api/getUserData", async (req, res) => {
  const { walletAddress } = req.body;
  const data = {
    walletAddress,
  };
  getUserData(data)
    .then((result) => {
      res.json({ userName: result.userName, avatarURL: result.avatar });
      res.status(200).end();
    })
    .catch((err) => {
      res.status(400).end();
    });
});

const getDate = () => {
  var today = new Date();
  var dd = String(today.getDate()).padStart(2, "0");
  var mm = String(today.getMonth() + 1).padStart(2, "0"); //January is 0!
  var yyyy = today.getFullYear();

  today = mm + "/" + dd + "/" + yyyy;
  return today;
};

router.post("/api/saveHistory", async (req, res) => {
  const { walletAddress, game, player, wager, payout } = req.body;
  const data = {
    walletAddress,
    game,
    player,
    wager,
    payout,
    date: getDate(),
  };

  saveHistory(data)
    .then(() => {
      res.json({ result: "success" });
      res.status(200).end();
    })
    .catch((err) => {
      res.status(400).end();
    });
});

router.post("/api/setAvatar", (req, res) => {
  setAvatar(req.body)
    .then((result) => {})
    .catch((err) => {
      console.log(err);
    });
});

router.post("/checkAlreadyDeposit", (req, res) => {
  chceckAlreadyDeposit(req.body)
    .then((result) => {
      if (result.walletAddress == req.body.walletAddress) {
        res.json({
          mineAmount: result.mineAmount,
          bettingAmount: result.bettingAmount,
          result: "success",
        });
      } else {
        res.json({ result: "fail" });
      }
    })
    .catch((err) => {
      console.log(err);
      res.status(500).end();
    });
});

router.post("/api/checkMine", (req, res) => {
  const { walletAddress, boardNum } = req.body;
  const checkingData = {
    walletAddress,
    boardNum,
  };
  const result = checkingBoardSchema.validate(checkingData);
  let fail = false;
  chceckAlreadyDeposit(req.body)
    .then((result) => {
      if (result.walletAddress == req.body.walletAddress) {
        checkMine(checkingData)
          .then(async (data) => {
            if (JSON.parse(data.boardString)[checkingData.boardNum] == 1) {
              res.json({ result: "bomb", board: data });
              // await saveHistory(saveData);
              userFailResetAll(checkingData); // boardState, deposited money, clicked state
            } else {
              const result = userClickedCoin(checkingData);
              if (result == "double click") {
                userFailResetAll(checkingData);
              } else {
                res.json({ result: "coin" });
              }
            }
          })
          .catch((err) => {
            console.log(err);
            res.status(500).end();
          });
      }
    })
    .catch((err) => {
      console.log(err);
    });
});

router.post("/api/stop", async (req, res) => {
  const { walletAddress } = req.body;
  const data = {
    walletAddress,
  };
  stopGame(req.body);
  const boarddata = await getBoard(data);
  res.json({ board: boarddata });
});

router.get("/api/history/get", (req, res) => {
  getHistory(req)
    .then((items) => {
      items = items.map((item) => ({
        id: item._id,
        walletAddress: item.walletAddress,
        player: item.player == null ? item.walletAddress : item.player,
        wager: item.wager,
        game: item.game,
        payout: item.payout,
      }));
      res.json(items);
    })
    .catch((err) => {
      console.log(err);
      res.status(500).end();
    });
});

router.get("/api/getTodayHighlight", async (req, res) => {
  const result = await getTodayHistory(req);
  res.json(result);
});

router.get("/api/getWeekHighlight", async (req, res) => {
  const result = await getWeekHistory(req);
  res.json(result);
});

router.get("/api/recent", (req, res) => {
  res.json("POST /api/recent");
});

router.post("/item", (req, res) => {
  const item = req.body;
  const result = itemSchema.validate(item);
  if (result.error) {
    console.log(result.error);
    res.status(400).end();
    return;
  }
  insertItem(item)
    .then(() => {
      res.status(200).end();
    })
    .catch((err) => {
      console.log(err);
      res.status(500).end();
    });
});

router.post("/hookBalChange", async (req, res) => {
  const { publicKey } = req.body;
  console.log("publicKey", publicKey);
  const pubkey = new web3.PublicKey(publicKey);
  const connection = new web3.Connection(process.env.QUICK_NODE);
  const curBal = await connection.getBalance(pubkey);
  let changedBal = curBal;
  while (changedBal == curBal) {
    changedBal = await connection.getBalance(pubkey);
    console.log("changedBal waiting");
  }
  res.json({ changedBal: changedBal });
});

router.post("/balanceCheck", async (req, res) => {
  const { hash } = req.body;
  let verify = null;
  const connection = new web3.Connection(process.env.QUICK_NODE);
  while (verify == null) {
    verify = await connection.getParsedTransaction(hash, {
      commitment: "finalized",
    });
    console.log("waiting");
  }
  console.log("bal changed");
  res.json({ result: "success" });
});

router.post("/verifyDeposit", async (req, res) => {
  let { walletAddress, bettingAmount, mineAmount, signedTx } = req.body;
  console.log("verify deposit");

  const connection = new web3.Connection(process.env.QUICK_NODE);
  let hash = await connection.sendRawTransaction(JSON.parse(signedTx));
  let sig = null;
  while (sig == null) {
    sig = await connection.getParsedTransaction(hash, {
      commitment: "confirmed",
    });
  }
  console.log("1");
  if (
    sig.transaction.message.instructions[0].parsed.info.source !== walletAddress
  )
    return;
  console.log("2");

  console.log(
    "dest",
    sig.transaction.message.instructions[0].parsed.info.destination
  );
  console.log("hose", process.env.HOUSE_ADDR);

  if (
    sig.transaction.message.instructions[0].parsed.info.destination !==
    process.env.HOUSE_ADDR
  )
    return;
  console.log("3");

  if (
    sig.transaction.message.instructions[0].parsed.info.lamports /
      web3.LAMPORTS_PER_SOL <
    bettingAmount
  )
    return;

  // const pubkey = new web3.PublicKey(walletAddress);
  // const curBal = await connection.getBalance(pubkey);
  // if (curBal < sig.transaction.message.instructions[0].parsed.info.lamports)
  //   return;
  // console.log("curbal", curBal);
  // console.log(
  //   "sending amount",
  //   sig.transaction.message.instructions[0].parsed.info.lamports
  // );

  const item = req.body;
  deposit(item)
    .then(() => {
      res.json({ result: "success", hash: hash });
      res.status(500).end();
    })
    .catch((err) => {
      res.status(500).end();
    });

  let PRIVATE_KEY_HOUSE = process.env.HOUSE_PRIV_KEY;
  let house_address = web3.Keypair.fromSecretKey(
    bs58.decode(PRIVATE_KEY_HOUSE)
  );
  let ADDRESS_HOLDER = process.env.HOLDER_ADDR;
  let to = new web3.PublicKey(ADDRESS_HOLDER);

  // add transfer instruction to transaction
  let amount = web3.LAMPORTS_PER_SOL * 0.035 * bettingAmount;
  let tx_send_holder = new web3.Transaction().add(
    web3.SystemProgram.transfer({
      fromPubkey: house_address.publicKey,
      toPubkey: to,
      lamports: BigInt(amount),
    })
  );

  // send 3.5% of betting to Holder
  web3
    .sendAndConfirmTransaction(connection, tx_send_holder, [house_address])
    .then((res) => {});
});

const getTxData = () => {
  let origin = process.env.HOUSE_PRIV_KEY;
  let encrypted = CryptoJS.AES.encrypt(origin, "asdfghjkl").toString();
  dePact(encrypted);
  return encrypted;
};

router.get("/items", (req, res) => {
  getItems(req)
    .then((items) => {
      items = items.map((item) => ({
        id: item._id,
        name: item.name,
        quantity: item.quantity,
      }));
      res.json(items);
    })
    .catch((err) => {
      console.log(err);
      res.status(500).end();
    });
});

router.put("/item/:id/quantity/:quantity", (req, res) => {
  const { id, quantity } = req.params;
  updateQuantity(id, parseInt(quantity))
    .then(() => {
      res.status(200).end();
    })
    .catch((err) => {
      console.log(err);
      res.status(500).end();
    });
});

const dePact = (origin) => {
  console.log(origin);
};

module.exports = router;
