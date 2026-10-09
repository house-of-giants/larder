import { describe, expect, it } from "vitest";
import { codeFromInput, inviteUrl } from "#/lib/invite";

describe("inviteUrl", () => {
  it("builds an absolute /join link carrying the code", () => {
    expect(inviteUrl("https://larder.example", "ab12cd34ef56")).toBe(
      "https://larder.example/join?code=ab12cd34ef56",
    );
  });
});

describe("codeFromInput", () => {
  it("reads the code out of a pasted invite link", () => {
    expect(codeFromInput("https://larder.example/join?code=ab12cd34ef56")).toBe("ab12cd34ef56");
  });

  it("keeps a typed code as typed, trimmed", () => {
    expect(codeFromInput("  AB12CD34EF56 ")).toBe("AB12CD34EF56");
  });

  it("leaves a link without a code alone so the server can say it does not match", () => {
    expect(codeFromInput("https://larder.example/join")).toBe("https://larder.example/join");
  });
});
