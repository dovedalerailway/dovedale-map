module.exports = {
	name: "dovedale-map",
	script: "server.ts",
	interpreter: "bun",
	env: {
		PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`,
	}
};
