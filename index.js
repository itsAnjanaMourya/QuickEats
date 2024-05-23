var express = require('express')
var paypal = require('paypal-rest-sdk');
var ejs = require('ejs')
var bodyParser = require('body-parser')
var mysql = require('mysql')
var session = require('express-session')
require('dotenv').config();
const path = require('path');
  
var app = express();

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));

app.use(session({secret:"secret", resave: true,
saveUninitialized: true}))

app.listen(5000);

function isProductInCart(cart, id){
    for(let i=0; i < cart.length; i++){
        if(cart[i].id == id){
            return true
        }
    }
}
app.get('/cart', function(req,res){

    var cart = req.session.cart ||[];
    var total = req.session.total || 0;

    res.render('pages/cart', {cart:cart, total:total});

});

function calculateTotal(cart, req){
    let total = 0;
    for(i=0; i<cart.length; i++){
        if(cart[i].sale_price){
            total = total + (cart[i].sale_price*cart[i].quantity)
        }
        else{
            total = total + (cart[i].price*cart[i].quantity)
        }
    }
    req.session.total = total;
    return total;
}

app.get('/', function(req, res){
    var con = mysql.createConnection({
        host:'localhost',
        user:'root',
        password:'anna123',
        database: 'food_project',
        port:3307
    });

    con.query('SELECT * FROM products', (err, result) => {
        if (err) {
            // Handle the error appropriately
            console.error(err);
            res.status(500).send('Internal Server Error');
            return;
        }

        res.render('pages/index', { result: result });
    });
});

app.post('/add_to_cart', function(req, res){
    var id = req.body.id;
    var name = req.body.name;
    var price = req.body.price;
    var sale_price = req.body.sale_price;
    var quantity = parseInt(req.body.quantity);
    var image = req.body.image;

    var product = {id:id, name:name, price:price, sale_price:sale_price, quantity:quantity, image:image}

    if(req.session.cart){
        var cart = req.session.cart;

        if(!isProductInCart(cart, id)){
            // If the product is not in the cart, add it
            cart.push(product)
        }
        else{
            // If the product is already in the cart, find it and update the quantity
            var existingProduct = cart.find(item => item.id === id);
            existingProduct.quantity += parseInt(quantity);
        }
    }
    else{
        req.session.cart = [product];
        var cart = req.session.cart;
    }

    //calculate total
    calculateTotal(cart,req);

    console.log('Add data:', { id, quantity });
    // return to cart page
    res.redirect('/cart');
});



app.post('/edit_product_quantity', function(req, res){
    var id = req.body.id;
    var quantity = req.body.quantity;
    var increase_btn = req.body.increase_product_quantity;
    var decrease_btn = req.body.decrease_product_quantity;
    var cart = req.session.cart;

    if(increase_btn){
        for(let i=0; i< cart.length; i++){
            if(cart[i].id == id){
                if(cart[i].quantity > 0){
                    cart[i].quantity = parseInt(cart[i].quantity) + 1
                }
            }
        }   
    }
    if(decrease_btn){
        for(let i=0; i< cart.length; i++){
            if(cart[i].id == id){
                if(cart[i].quantity > 1){
                    cart[i].quantity = parseInt(cart[i].quantity) - 1
                }
            }
        }    
    }
    

    calculateTotal(cart, req);
    res.redirect('/cart');
    console.log('Received data:', { id, quantity, increase_btn, decrease_btn });
});
app.post('/remove_product', function (req, res) {
    // Get the product ID from the form submission
    var productIdToRemove = req.body.id;
    var quantityToRemove = req.body.quantity ? parseInt(req.body.quantity) : 1;
   
    var cart = req.session.cart;

    var indexToRemove = cart.findIndex(item => item.id === productIdToRemove);

    // Check if the product was found in the cart
    if (indexToRemove >= 0) {
        // If quantity is greater than 1, decrease the quantity
        // if (quantityToRemove > 1) {
        //     cart[indexToRemove].quantity = parseInt(quantityToRemove) - 1;
        // } else {
            // Remove the product from the cart
            cart.splice(indexToRemove, 1);
        //}

        // Recalculate the total (if needed)
        calculateTotal(cart, req);
    }

    console.log('Removed data:', { productIdToRemove, quantityToRemove });
    calculateTotal(cart, req)
    res.redirect('/cart');
});

app.get('/checkout', function(req, res){
    var total = req.session.total;

    res.render('pages/checkout', {total:total})
})

app.post('/place_order', function(req, res){
    var name = req.body.name;
    var email = req.body.email;
    var phone = req.body.phone;
    var city = req.body.city; 
    var address = req.body.address;
    var cost = req.session.total;
    var status = "not paid";
    var date = new Date();
    var products_ids = "";
    var id = Date.now();
    req.session.order_id=id;

    var con = mysql.createConnection({
        host:'localhost',
        user:'root',
        password:'anna123',
        database: 'food_project',
        port:3307
    });

    var cart = req.session.cart ||[];
    for(i=0; i<cart.length; i++){
        products_ids = products_ids +","+ cart[i].id
    }

    con.connect((err)=>{
        if(err)
        {
            console.log(err);
        }
        else{
            var query = "INSERT INTO orders(id,cost,name, email, status, city, address, phone, date, products_ids) VALUES ?";
            var values = [
                [id,cost,name, email, status, city, address, phone, date, products_ids]
            ];
            con.query(query, [values], (err, result)=>{
                for(let i=0; i<cart.length; i++){
                    var query = "INSERT INTO order_items(order_id, product_id, product_name, product_price, product_image, product_quantity, order_date) VALUES ?";
                    var values = [
                        [id, cart[i].id, cart[i].name, cart[i].price, cart[i].image, cart[i].quantity, new Date()]
                    ];
                    con.query(query, [values], (err,result)=>{})
                }

                res.redirect('/payment')
            })
        }

    })
})

app.get('/payment', function(req, res){
    var total = req.session.total
    res.render('pages/payment',{total:total});
});

app.get("/verify_payment",function(req,res){
    var transaction_id = req.query.transaction_id;
    var order_id = req.session.order_id;

    var con = mysql.createConnection({
        host:'localhost',
        user:'root',
        password:'anna123',
        database: 'food_project',
        port:3307
    });
    con.connect((err)=>{
        if(err)
        {
            console.log(err);
        }
        else{
            var query = "INSERT INTO payments(order_id,transaction_id,date) VALUES ?";
            var values = [
                [order_id,
                transaction_id,
                new Date()
                ]
            ]
            con.query(query,[values],(err,result)=>{
                con.query("UPDATE orders SET status='paid' WHERE id='"+order_id+"'",(err, result)=>{}
                )
                    res.redirect('/thank_you')
            })
        }
        })
})

app.get("/thank_you",function(req,res){
    var order_id = req.session.order_id;
    res.render("pages/thank_you",{order_id:order_id})
});

app.get("/single_product", function(req, res){

    var id = req.query.id;
    var con = mysql.createConnection({
        host:'localhost',
        user:'root',
        password:'anna123',
        database: 'food_project',
        port:3307
    });

    con.query("SELECT * FROM products WHERE id='"+id+"'", (err, result) => {
        if (err) {
            // Handle the error appropriately
            console.error(err);
            res.status(500).send('Internal Server Error');
            return;
        }
        res.render('pages/single_product', { result: result });
    });
    
});


app.get("/products", function(req, res){

    var con = mysql.createConnection({
        host:'localhost',
        user:'root',
        password:'anna123',
        database: 'food_project',
        port:3307
    });
    con.query('SELECT * FROM products', (err, result) => {
        if (err) {
            // Handle the error appropriately
            console.error(err);
            res.status(500).send('Internal Server Error');
            return;
        }
        res.render('pages/products', { result: result });
    });
});


app.get("/about", function(req, res){

    res.render("pages/about")
});