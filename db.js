const bs58 = require("bs58");
const web3 = require("@solana/web3.js");

const { MongoClient, ObjectId } = require("mongodb");
// const connectionUrl = process.env.DB_URL;
const connectionUrl = "mongodb://localhost:27017";

const dbName = "minerush";

const HOUSE_EDGE = 0.92;

global.db;

const init = () =>
  MongoClient.connect(connectionUrl, { useNewUrlParser: true }).then(
    (client) => {
      db = client.db(dbName);
    }
  );

const insertItem = (item) => {
  const collection = db.collection("items");
  db.find({});
  return collection.insertOne(item);
};

const getBoard = (boardObject) => {
  const collection = db.collection("boards");
  const query = { walletAddress: boardObject.walletAddress };
  return collection.findOne(query);
};

const stopGame = async (data) => {
  const collection = db.collection("boards");
  const query = { walletAddress: data.walletAddress };
  const curBoard = await collection.findOne(query);
  const boardClickedString = JSON.parse(curBoard.boardClickedString);
  const boardString = JSON.parse(curBoard.boardString);
  let coinAmount = 0;
  for (let i = 0; i < 25; i++) {
    if (boardClickedString[i] == 1 && boardString[i] == 0) coinAmount++;
  }

  const multi = getMulti(coinAmount, curBoard.mineAmount);
  const depositCollection = db.collection("deposit");
  const curDeposit = await depositCollection.findOne(query);
  claimReward(curBoard.walletAddress, multi * curDeposit.bettingAmount);
  userFailResetAll(data);
};

const claimReward = async (walletAddress, payout) => {
  const connection = new web3.Connection(process.env.QUICK_NODE);

  let PRIVATE_KEY_HOUSE = process.env.HOUSE_PRIV_KEY;
  let house_address = web3.Keypair.fromSecretKey(
    bs58.decode(PRIVATE_KEY_HOUSE)
  );
  let ADDRESS_HOLDER = walletAddress;
  let to = new web3.PublicKey(ADDRESS_HOLDER);
  console.log("payout", payout);
  let amount = web3.LAMPORTS_PER_SOL * parseFloat(payout.toFixed(3));
  console.log("payout", parseFloat(payout.toFixed(3)));
  let tx_send_holder = new web3.Transaction().add(
    web3.SystemProgram.transfer({
      fromPubkey: house_address.publicKey,
      toPubkey: to,
      lamports: BigInt(amount),
    })
  );

  // sign tx, broadcast, and confirm
  web3
    .sendAndConfirmTransaction(connection, tx_send_holder, [house_address])
    .then((res) => {
      console.log("claimed success ---------------", res);
    })
    .catch((err) => {
      console.log("claimed error -----------------");
    });
};

const getMulti = (coinAmount, mineAmount) => {
  console.log("coinAmount", coinAmount);
  let tempMulti = 1;
  for (let j = 0; j < coinAmount; j++) {
    tempMulti *= 25 / (25 - mineAmount);
  }
  console.log(tempMulti * HOUSE_EDGE);
  return tempMulti * HOUSE_EDGE;
};

const getUserData = (data) => {
  const collection = db.collection("users");
  console.log('data', data)
  const query = { walletAddress: data.walletAddress };
  return collection.findOne(query);
};

const deposit = (data) => {
  const collection = db.collection("deposit");
  const query = { walletAddress: data.walletAddress };
  const update = { $set: data };
  const options = { upsert: true };
  return collection.updateOne(query, update, options);
};

const userFailResetAll = (data) => {
  const collection = db.collection("deposit");
  const query = { walletAddress: data.walletAddress };
  const update = { $set: data };
  return collection.deleteOne(query);
};

const deleteDeposit = (data) => {
  const collection = db.collection("deposit");
  const query = { walletAddress: data.walletAddress };
  const options = { upsert: true };
  collection.deleteOne({ walletAddress: data.walletAddress });
  return true;
};

const checkDeposit = (data) => {
  const collection = db.collection("deposit");
  const query = { walletAddress: data.walletAddress };
  return collection.findOne(query);
};

const chceckAlreadyDeposit = async (data) => {
  const collection = db.collection("deposit");
  const query = { walletAddress: data.walletAddress };
  const result = await collection.findOne(query);
  if (result.walletAddress == data.walletAddress) {
    result.mineAmount = data.mineAmount;
    const options = { upsert: true };
    const update = { $set: result };
    await collection.updateOne(query, update, options);
  }
  return result;
};

const insertBoard = (boardObject) => {
  const collection = db.collection("boards");
  const query = { walletAddress: boardObject.walletAddress };
  const update = { $set: boardObject };
  const options = { upsert: true };
  return collection.updateOne(query, update, options);
};

const checkMine = (checkData) => {
  const collection = db.collection("boards");
  const query = { walletAddress: checkData.walletAddress };
  const curBoard = collection.findOne(query);
  curBoard.fail = true;
  const update = { $set: curBoard };
  const options = { upsert: true };
  collection.updateOne(query, update, options);
  return collection.findOne(query);
};

const userClickedCoin = async (data) => {
  const collection = db.collection("boards");
  const query = { walletAddress: data.walletAddress };
  const curBoard = await collection.findOne(query);
  const clickeddata = JSON.parse(curBoard.boardClickedString);
  if (clickeddata[data.boardNum] == 1) {
    return "double click";
  }
  clickeddata[data.boardNum] = 1;
  curBoard.boardClickedString = JSON.stringify(clickeddata);
  const update = { $set: curBoard };
  const options = { upsert: true };
  await collection.updateOne(query, update, options);
  let result = true;
  const tempBoard = JSON.parse(curBoard.boardString);
  for (let i = 0; i < 25; i++) {
    if (clickeddata[i] == 0 && tempBoard[i] == 0) result = false;
  }
  if (result) {
    const multi = getMulti(25 - curBoard.mineAmount, curBoard.mineAmount);
    const depositCollection = db.collection("deposit");
    const curDeposit = await depositCollection.findOne(query);
    claimReward(curBoard.walletAddress, multi * curDeposit.bettingAmount);
    userFailResetAll(data);
    return result;
  }
  return result;
};

const saveHistory = (historyData) => {
  const boardcollection = db.collection("boards");
  const depositCollection = db.collection("deposit");
  const collection = db.collection("history");
  const query = { walletAddress: historyData.walletAddress };
  boardcollection.deleteOne({ walletAddress: historyData.walletAddress });
  depositCollection.deleteOne({ walletAddress: historyData.walletAddress });
  return collection.insertOne(historyData);
};

const saveUser = (userdata) => {
  const userscollection = db.collection("users");
  const query = { walletAddress: userdata.walletAddress };
  const update = { $set: userdata };
  const options = { upsert: true };
  return userscollection.updateOne(query, update, options);
};

const setAvatar = async (avatarData) => {
  const userscollection = db.collection("users");
  const query = { walletAddress: avatarData.walletAddress };
  const userData = await userscollection.findOne(query);
  userData.avatar = avatarData.avatarURL;
  const update = { $set: userData };
  const options = { upsert: true };
  return userscollection.updateOne(query, update, options);
};

const getHistory = () => {
  const collection = db.collection("history");
  return collection.find({}).sort({ $natural: -1 }).limit(11).toArray();
};

const getAllHistory = () => {
  const collection = db.collection("history");
  return collection.find({}).sort({ $natural: -1 }).toArray();
};

const getTodayHistory = () => {
  var today = new Date();
  var dd = String(today.getDate()).padStart(2, "0");
  var mm = String(today.getMonth() + 1).padStart(2, "0"); //January is 0!
  var yyyy = today.getFullYear();

  today = mm + "/" + dd + "/" + yyyy;

  const collection = db.collection("history");
  const query = { date: today };
  return collection.find({ date: today }).toArray();
};

const getWeekHistory = () => {
  var today = new Date();
  var dd = String(today.getDate()).padStart(2, "0");
  var mm = String(today.getMonth() + 1).padStart(2, "0"); //January is 0!
  var yyyy = today.getFullYear();
  today = mm + "/" + dd + "/" + yyyy;

  var today1 = new Date();
  var dd = String(today1.getDate() - 1).padStart(2, "0");
  var mm = String(today1.getMonth() + 1).padStart(2, "0"); //January is 0!
  var yyyy = today1.getFullYear();
  today1 = mm + "/" + dd + "/" + yyyy;

  var today2 = new Date();
  var dd = String(today2.getDate() - 2).padStart(2, "0");
  var mm = String(today2.getMonth() + 1).padStart(2, "0"); //January is 0!
  var yyyy = today2.getFullYear();
  today2 = mm + "/" + dd + "/" + yyyy;

  var today3 = new Date();
  var dd = String(today3.getDate() - 3).padStart(2, "0");
  var mm = String(today3.getMonth() + 1).padStart(2, "0"); //January is 0!
  var yyyy = today3.getFullYear();
  today3 = mm + "/" + dd + "/" + yyyy;

  var today4 = new Date();
  var dd = String(today4.getDate() - 4).padStart(2, "0");
  var mm = String(today4.getMonth() + 1).padStart(2, "0"); //January is 0!
  var yyyy = today4.getFullYear();
  today4 = mm + "/" + dd + "/" + yyyy;

  var today5 = new Date();
  var dd = String(today5.getDate() - 5).padStart(2, "0");
  var mm = String(today5.getMonth() + 1).padStart(2, "0"); //January is 0!
  var yyyy = today5.getFullYear();
  today5 = mm + "/" + dd + "/" + yyyy;

  var today6 = new Date();
  var dd = String(today6.getDate() - 6).padStart(2, "0");
  var mm = String(today6.getMonth() + 1).padStart(2, "0"); //January is 0!
  var yyyy = today6.getFullYear();
  today6 = mm + "/" + dd + "/" + yyyy;

  const collection = db.collection("history");

  return collection
    .find({
      date: {
        $in: [today, today1, today2, today3, today4, today5, today6],
      },
    })
    .toArray();
};

const getItems = () => {
  const collection = db.collection("items");
  return collection.find({}).toArray();
};

const updateQuantity = (id, quantity) => {
  const collection = db.collection("items");
  return collection.updateOne({ _id: ObjectId(id) }, { $inc: { quantity } });
};

module.exports = {
  init,
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
};
