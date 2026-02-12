/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testTimeout: 60000,
	rootDir: "test",
  resolver: "<rootDir>/resolver.cjs",

  // Path aliases
  moduleNameMapper: {
    "^src/(.*)\\.js$": "<rootDir>/../src/$1.ts",
    "^src/(.*)$": "<rootDir>/../src/$1",
    "^test/(.*)\\.js$": "<rootDir>/$1.ts",
    "^test/(.*)$": "<rootDir>/$1",
    "^lib0/((?!dist/).*)$": "<rootDir>/../node_modules/lib0/dist/$1.cjs",
    "^y-protocols/(.*)$": "<rootDir>/../node_modules/y-protocols/dist/$1.cjs",
    "^yjs$": "<rootDir>/../node_modules/yjs/dist/yjs.cjs",
  },

  // If you're compiling TS with ts-jest:
  preset: "ts-jest",
	"testRegex": ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)sx?$": [
      "ts-jest",
      {
        useESM: true,
				tsconfig: "<rootDir>/../tsconfig.spec.json"
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts"],

	"coverageDirectory": "../coverage",
	"collectCoverageFrom": [
		"**/*.(t|j)s"
	],

  // NodeNext + ESM import fixups
  moduleFileExtensions: ["ts", "js", "json"],
};
