const express = require('express');
const cors = require('cors')

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
var jwt = require('jsonwebtoken');

// stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express()
const port = process.env.PORT || 5000;


// midlleware
app.use(cors())
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bbvd3eh.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const database = client.db("petAdoption");
        const usersCollection = database.collection('users');
        const allPetsCollection = database.collection('allPets');
        const donationCampCollection = database.collection('donationCamps');
        const adoptionRequestCollection = database.collection('adoptionRequests');
        const userDonatedCollection = database.collection('userDonations')

        // jwt related api

        app.post('/jwt', async (req, res) => {

            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '1h' });
            res.send({ token })
        })


        // middleware
        const verifyToken = (req, res, next) => {
            console.log("inside verifytoken", req.headers.authorization);
            if (!req?.headers?.authorization) {
                return res.status(401).send({ message: "unauthorized access" })
            }
            const token = req?.headers?.authorization.split(" ")[1];

            jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
                if (err) {
                    return res.status(401).send({ message: "unauthorized access" })
                }
                req.decoded = decoded;
                next();
            });
        }

        // use verify admin after verify token
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query)

            const isAdmin = user?.role === 'admin'
            if (!isAdmin) {
                return res.status(403).send({ message: "forbidden access" })
            }
            next();
        }





        // user collection
        app.post("/users", async (req, res) => {
            const userData = req.body;

            // insert email if user doesn't exist
            // you can do this many ways (1. email unique, 2. upsert 3. simple checking)
            const query = { email: userData?.email }
            const isExist = await usersCollection.findOne(query)

            if (isExist) {
                return res.send({ message: "user already exist", insertedId: null })
            }

            const result = await usersCollection.insertOne(userData)
            res.send(result)
        })

        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

        app.patch('/users', verifyToken, verifyAdmin, async (req, res) => {
            const data = req.body;

            const filter = { _id: new ObjectId(data.id) };
            const updateDoc = {
                $set: {
                    role: data.roleStatus
                },
            };

            // console.log(filter, updateDoc);

            const result = await usersCollection.updateOne(filter, updateDoc)
            res.send(result)

        })

        app.get('/users/admin/:email', verifyToken, async (req, res) => {

            const email = req.params.email;
            console.log("emai", email);
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: "forbidden access" })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query)

            let isAdmin = false;
            if (user) {
                isAdmin = user?.role === 'admin'
            }
            console.log("admin", isAdmin);
            res.send({ isAdmin })
        })




        // allPetsCollection
        app.post('/allPets', verifyToken, async (req, res) => {
            const body = req.body;
            const date = new Date()
            body.addedTime = date
            // console.log(body, date,);
            const result = await allPetsCollection.insertOne(body)
            res.send(result)
        })

        app.put('/allpets', verifyToken, async (req, res) => {

            const id = req.query.id;
            const data = req.body;

            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };

            const updateDoc = {
                $set: {
                    petName: data.petName,
                    petAge: data.petAge,
                    petCategory: data.petCategory,
                    petLocation: data.petLocation,
                    petShortDes: data.petShortDes,
                    petLongDes: data.petLongDes,
                    petImg: data.petImg,
                },
            };

            const result = await allPetsCollection.updateOne(filter, updateDoc, options);
            res.send(result);

            // console.log(id, data);
        })

        app.patch('/allPets', verifyToken, async (req, res) => {
            const data = req.body;

            const filter = { _id: new ObjectId(data.id) };
            const updateDoc = {
                $set: {
                    adoptStatus: data.status
                },
            };

            // console.log(filter, updateDoc);

            const result = await allPetsCollection.updateOne(filter, updateDoc)
            res.send(result)

        })

        app.delete('/allPets/:id', verifyToken, async (req, res) => {
            const id = req.params.id;

            const query = { _id: new ObjectId(id) }

            const result = await allPetsCollection.deleteOne(query)
            res.send(result)
        })

        // single pet
        app.get('/singlePet/:id', async (req, res) => {

            const id = req.params.id;
            const query = { _id: new ObjectId(id) }

            // console.log("id", id);
            const result = await allPetsCollection.findOne(query)
            res.send(result)
        })

        // all pet useMenu pet hook with email query
        app.get('/allPets', verifyToken, async (req, res) => {

            const options = {
                sort: {
                    addedTime: -1
                }
            }

            const filter = req.query;

            let query = {};

            if (filter.email) {
                query = {
                    ownerEmail: filter.email,
                }
            }

            const result = await allPetsCollection.find(query, options).toArray()
            res.send(result)
        })

        // pet list key wise data
        app.get('/petLists', async (req, res) => {

            const options = {
                sort: {
                    addedTime: -1
                }
            }

            const filter = req.query;
            console.log("key", filter);

            let query = { adoptStatus: false };

            if (filter.petKey) {
                query = {
                    "petCategory.value": filter.petKey,
                    adoptStatus: false
                }
            }
            else if (filter.search) {
                query = {
                    petName: { $regex: filter.search, $options: 'i' },
                    adoptStatus: false
                }
            }
            console.log("query", query);

            const result = await allPetsCollection.find(query, options).toArray()
            res.send(result)
        })


        // donation camp collection

        app.get('/donationCamps', async (req, res) => {

            const options = {
                sort: {
                    createdTime: -1
                }
            }

            const result = await donationCampCollection.find({}, options).toArray()
            res.send(result)
        })

        app.get('/singleDonationCamp/:id', async (req, res) => {

            const id = req.params.id;
            const query = { _id: new ObjectId(id) }

            // console.log("id", id);
            const result = await donationCampCollection.findOne(query)
            res.send(result)
        })


        app.post('/donationCamps', verifyToken, async (req, res) => {
            const body = req.body;
            const date = new Date()
            body.createdTime = date
            // console.log(body, date,);
            const result = await donationCampCollection.insertOne(body)
            res.send(result)
        })
        app.put('/donationCamps', verifyToken, async (req, res) => {

            const id = req.query.id;
            const data = req.body;

            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };

            const updateDoc = {
                $set: {
                    petName: data.petName,
                    maxDonation: data.maxDonation,
                    lastDate: data.lastDate,
                    dCampShortDes: data.dCampShortDes,
                    dCampLongDes: data.dCampLongDes,
                    dCampImg: data.dCampImg,
                },
            };

            const result = await donationCampCollection.updateOne(filter, updateDoc, options);
            res.send(result);

        })

        app.patch('/donationCamps', verifyToken, async (req, res) => {
            const data = req.body;

            const filter = { _id: new ObjectId(data.id) };
            const updateDoc = {
                $set: {
                    pauseStatus: data.status
                },
            };

            // console.log(filter, updateDoc);

            const result = await donationCampCollection.updateOne(filter, updateDoc)
            res.send(result)

        })

        app.delete('/donationCamps/:id', verifyToken, async (req, res) => {
            const id = req.params.id;

            const query = { _id: new ObjectId(id) }

            const result = await donationCampCollection.deleteOne(query)
            res.send(result)
        })


        // adoptionRequestCollection
        app.post('/adoptionRequests', verifyToken, async (req, res) => {
            const body = req.body;
            const date = new Date()
            body.requestedAt = date
            // console.log(body, date,);
            const result = await adoptionRequestCollection.insertOne(body)
            res.send(result)
        })

        // pet request list
        app.get('/adoptionRequests', verifyToken, async (req, res) => {

            const email = req.query.email;

            const result = await adoptionRequestCollection.aggregate([
                {
                    $addFields: {
                        objectPetID: { $toObjectId: '$petId' }
                    }
                },
                {
                    $lookup: {
                        from: 'allPets',
                        localField: 'objectPetID',
                        foreignField: '_id',
                        as: "requestedPet"
                    }
                },
                {
                    $unwind: '$requestedPet'
                },
                {
                    $match: { email: email }
                }
            ]).toArray()

            res.send(result)
        })

        app.patch('/adoptionRequests', verifyToken, async (req, res) => {
            try {
                const data = req.body;

                const filterRequest = { _id: new ObjectId(data.id) };
                const filterAdopt = { _id: new ObjectId(data.petId) };

                let requestStatus = '';
                let adoptStatus = null;

                if (data.changeRequest.toLowerCase() == 'accept') {
                    requestStatus = 'accept';
                    adoptStatus = true;
                } else {
                    requestStatus = 'reject';
                    adoptStatus = false;
                }

                const requestUpdate = {
                    $set: {
                        requestStatus: requestStatus,
                    },
                };

                const adoptUpdate = {
                    $set: {
                        adoptStatus: adoptStatus,
                    },
                };

                console.log(requestStatus, adoptStatus);

                const requestResult = await adoptionRequestCollection.updateOne(filterRequest, requestUpdate);
                const adoptResult = await allPetsCollection.updateOne(filterAdopt, adoptUpdate);

                res.send({ requestResult, adoptResult });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });



        // userDonatedCollection

        // add and update together
        app.post('/userDonations', verifyToken, async (req, res) => {

            const body = req.body;
            const date = new Date()
            body.donatedAt = date
            // console.log(body, date,);

            // add 
            const addedDonation = await userDonatedCollection.insertOne(body)

            // update
            const filter = { _id: new ObjectId(body.campaignID) }
            const updateDoc = {
                $set: {
                    donatedAmount: body.totalDonation
                },
            };

            const updateDonationCampAmount = await donationCampCollection.updateOne(filter, updateDoc);
            res.send({ addedDonation, updateDonationCampAmount })

        })

        app.get('/userDonations', async (req, res) => {

            const id = req.query.campId;
            console.log(id);
            const query = { campaignID: id }
            console.log(query);

            // campaign total donations
            const donation = await userDonatedCollection.aggregate([
                {
                    $match: query // Use $match to filter documents
                },
                {
                    $group: {
                        _id: '$campaignID', // Use the actual field name for grouping
                        totalDonatedAmount: {
                            $sum: { $toDouble: '$donatedAmount' } // Convert string to double for summation
                        }
                    }
                },
            ]).toArray()


            const totalDonatedAmount = donation.length > 0 ? donation[0].totalDonatedAmount : 0;

            const result = await userDonatedCollection.find(query).toArray()

            res.send({ result, totalDonatedAmount })
        })

        // email wise donations data
        app.get('/myDonations', verifyToken, async (req, res) => {

            const email = req.query.email;
            console.log("object", email);

            const result = await userDonatedCollection.aggregate([
                {
                    $addFields: {
                        objectCampaignID: { $toObjectId: '$campaignID' }
                    }
                },
                {
                    $lookup: {
                        from: 'donationCamps',
                        localField: 'objectCampaignID',
                        foreignField: '_id',
                        as: "donationCamps"
                    }
                },
                {
                    $unwind: '$donationCamps'
                },
                {
                    $match: { email: email }
                }

            ]).toArray()

            res.send(result)

        })


        app.delete('/userDonations', async (req, res) => {
            const id = req.query.id;

            const query = { _id: new ObjectId(id) }

            const result = await userDonatedCollection.deleteOne(query)
            res.send(result)
        })



        // ************* payment ***************

        // stripe payement: create payment intent
        app.post('/create-payment-intent', async (req, res) => {

            const { amount } = req.body;
            // count money as posha , 5tk means 500 poisha
            const donatedAmount = parseInt(amount * 100)
            // console.log("stripe", donatedAmount);

            const payementIntent = await stripe.paymentIntents.create({
                amount: 2000,
                currency: 'usd',
                payment_method_types: [
                    "card"
                ],
            })

            res.send({
                clientSecret: payementIntent.client_secret
            })

        })





        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send("Server is Ongoing")
})


app.listen(port, () => {
    console.log(`My server running on port: ${port}`);
})