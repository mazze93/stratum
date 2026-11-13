# Draft for mazze93/homebrew-tap (Formula/stratum.rb). The sha256 is filled in
# from the *published* npm tarball, never from a local pack (docs/RELEASING.md).
class Stratum < Formula
  desc "Epistemic decision ledger CLI: decisions count once evidence is checked"
  homepage "https://stratum.mazzeleczzare.com"
  url "https://registry.npmjs.org/@stratum-ledger/cli/-/cli-0.5.0.tgz"
  sha256 "FILL_FROM_PUBLISHED_TARBALL"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_equal version.to_s, shell_output("#{bin}/stratum --version").strip
    assert_match "one recorded decision", shell_output("#{bin}/stratum help")
  end
end
