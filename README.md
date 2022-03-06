# typescript-swc-starter

A simple node boilerplate made in typescript using swc.

> NOTE : A version without rust compiler [swc](https://swc.rs/) is available [here](https://github.com/maxgfr/boilerplate-typescript-node).

## Clone repository and install dependencies

```sh
git clone https://github.com/maxgfr/typescript-swc-starter # For cloning the repository
cd typescript-swc-starter # To navigate to the repository root
yarn # Install dependencies
cp .env.example .env
```

## Running the code

```sh
yarn build # For building the code with typechecking
yarn build:swc # For building without typechecking
yarn start # For running the code builded
```

Or in `development` mode:

```sh
yarn dev # For running the code in development thanks to swc and nodemon
```

> **/!\ No typechecking made in dev mode**

## Testing the code

```sh
yarn test # For running unit test
yarn test:watch # For watching unit test
```
