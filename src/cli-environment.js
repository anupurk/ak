"use strict";
const promisify = require("util").promisify || require("util.promisify");
const spawn = require("./spawn");
const gitWin = require("git-win");
const path = require("path");
const fs = require("fs");
const os = require("os");
const binDir = path.join(__dirname, "../bin");
require("./env-value");

function set (key, value) {
	value = value || process.env[key];
	if (value) {
		console.log(`set "${key}=${value}"`);
	}
}

async function login () {
	const envPath = gitWin.toWin32("/usr/bin/env.exe");
	if (process.env.SHELL) {
		set("PATH");
		console.log(`"${envPath}" "${process.env.SHELL}" --login`);
	}

	const HOME = gitWin.toPosix(process.env.HOME);
	const env = await spawn([
		envPath,
		"--ignore-environment",
		"HOME=" + HOME,
		process.env.SHELL || "/bin/bash",
		"--login",
		"-c",
		"env",
	], {
		env: {
			MSYSTEM: gitWin.mingw.toUpperCase(),
		},
		encoding: "utf8",
	});
	env.split(/[\r\n]+/g).forEach(env => {
		if (!env || /^(?:!.+|_|(?:ORIGINAL|MSYSTEM|MINGW)(?:_.+)?|HOME|PWD|SHELL|TERM|PS1|SHLVL|SYSTEMROOT|WINDIR)=/i.test(env) || /=\/mingw\d+(?=\/|$)/.test(env)) {
			return;
		} else if (/^PATH=/i.test(env)) {
			env = env.slice(5);
			process.env.PATH = env.replace(new RegExp("(^|:)" + HOME + "(?=/|:|$)", "g"), "$1~");
			set("PATH");
			return;
		}
		console.log(`set "${env}"`);
	});
}

async function npmrc () {
	const nodeDir = path.dirname(process.execPath);
	const readFile = promisify(fs.readFile);
	async function read (file) {
		try {
			const ini = require(path.join(nodeDir, "node_modules/npm/node_modules/ini/ini.js"));
			const contents = await readFile(file, "utf8");
			return ini.parse(contents);
		} catch (ex) {
			return {};
		}
	}

	const npmConfig = {
		prefix: process.env.npm_config_prefix || path.join(process.env.APPDATA, "npm"),
		shell: process.env.npm_config_shell,
	};

	await Promise.all(
		[
			path.join(npmConfig.prefix, "etc/npmrc"),
			path.join(os.homedir(), ".npmrc"),
			".npmrc",
		].map(read)
	).then(config => {
		Object.assign(npmConfig, ...config);
	});

	if (npmConfig.shell && !/^(?:.*\\)?cmd(?:\.exe)?$/i.test(npmConfig.shell)) {
		process.env.SHELL = npmConfig.shell;
	}
}

delete process.env.GIT_BASH_SHELL_INIT;
process.env.PATH = binDir + ";" + process.env.PATH;

npmrc().then(login).then(() => {
	set("SHELL");
	if (process.env.ProgramData) {
		set("CMDER_ROOT", path.join(process.env.ProgramData, "Cmder"));
	}
	set("GIT_INSTALL_ROOT", gitWin.root);
});
