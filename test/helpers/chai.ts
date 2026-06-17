// @types/chai uses `export =`, so re-export `expect` through a default import
// (esModuleInterop) for the test files to consume with a named import.
import chai from "chai";

export const expect = chai.expect;
