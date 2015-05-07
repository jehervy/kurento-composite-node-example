Kurento composite node example
==============================

This is an example of how mixing several video streams with Kurento and Node.js.
In this example, each client send his own video stream and receive a mix of all video streams.

Kurento media server installation
---------------------------------

Please refer to [Kurento Media Server Github repository] to find installation guide.

Kurento composite node example installation
------------------------------------------

Be sure to have installed [Node.js] in your system:

```bash
curl -sL https://deb.nodesource.com/setup | sudo bash -
sudo apt-get install -y nodejs
```

Install node modules and bower components

```bash
npm install
```

Run the application

```bash
npm start
```

Setting Kurento Media Server url and port
------------------------------------------

By default, the application server try to reach a Kurento Media Server at localhost. You can change the host and the port of kurento media server in server.js.

[Kurento Media Server Github repository]: https://github.com/Kurento/kurento-media-server