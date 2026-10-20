{
  pkgs,
  lib,
  config,
  inputs,
  ...
}:

{
  # https://devenv.sh/basics/
  env.GREET = "devenv";

  # https://devenv.sh/packages/
  packages = [
    pkgs.git
    pkgs.tsx
  ];

  # https://devenv.sh/languages/
  # languages.rust.enable = true;
  languages = {
    typescript.enable = true;
    javascript = {
      enable = true;
      npm.enable = true;
    };
  };

  # https://devenv.sh/processes/
  # processes.dev.exec = "${lib.getExe pkgs.watchexec} -n -- ls -la";

  # https://devenv.sh/services/
  # services.postgres.enable = true;

  # https://devenv.sh/scripts/
  scripts = {
    build.exec = "npm run build";
    run.exec = "npm run dev";
    update.exec = "npm install && npm install-scripts approve --all";
    new.exec = ''
      newdir="$DEVENV_ROOT/content/$1"
      newitdir="$DEVENV_ROOT/content/it/$1"
      layoutblank="<div>{props.children}</div>"
      indexblank="---
      title: Blank Title
      description: Blank description
      ---
      <Container>
      # Not yet implemented.
      <RelatedItems />
      </Container>"


      if [[ -d "$newdir" ]]; then
        echo "Error: directory '$newdir' already exists." >&2
        exit 1
      fi

      if [[ -d "$newitdir" ]]; then
        echo "Error: directory '$newitdir' already exists." >&2
        exit 1
      fi

      mkdir -p "$newdir"
      mkdir -p "$newitdir"

      echo "$layoutblank" > "$newdir/_layout.mdx"
      echo "$indexblank" > "$newdir/index.mdx"

      cp -r "$newdir/." "$newitdir"
    '';
  };

  # https://devenv.sh/basics/
  # enterShell = ''
  # '';

  # https://devenv.sh/tasks/
  # tasks = {
  #   "myproj:setup".exec = "mytool build";
  #   "devenv:enterShell".after = [ "myproj:setup" ];
  # };

  # https://devenv.sh/tests/
  # enterTest = ''
  # '';

  # https://devenv.sh/git-hooks/
  # git-hooks.hooks.shellcheck.enable = true;

  # See full reference at https://devenv.sh/reference/options/
}
