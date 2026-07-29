/**
 * ZEP API 호출에 undefined가 흘러드는지 검사한다.
 *
 * 왜 필요한가:
 *
 * ScriptApp / ScriptPlayer / ScriptMap은 JS 함수가 아니라 C# 메서드다.
 * ZEP 런타임(Jint)은 인자의 "개수와 타입"으로 오버로드를 고르기 때문에,
 * 뒤쪽 선택 인자 자리를 채우려고 undefined를 넣으면 생략으로 처리되지 않고
 * 맞는 오버로드가 없어 스크립트가 통째로 죽는다:
 *
 *   Jint.Runtime.JavaScriptException:
 *   No public methods with the specified arguments were found
 *
 * .d.ts의 `frameRate?: number`는 "생략 가능"이라는 뜻이지
 * "undefined를 받는다"는 뜻이 아니다. 그런데 TypeScript는 이 둘을 구분하지
 * 않으므로 `tsc`도, ESLint도 이 실수를 잡지 못한다.
 * (ESLint의 no-restricted-syntax는 리터럴 `undefined`만 잡는다.
 *  실제 사고를 낸 것은 `number | undefined` 타입의 변수였다.)
 *
 * 그래서 TypeScript 컴파일러 API로 각 호출의 시그니처를 실제로 해석해서,
 * 선언이 zep-script 안에 있는 호출의 인자 중 타입에 undefined가 섞인 것을
 * 찾아낸다. 리터럴이든 변수든 경로와 무관하게 잡힌다.
 *
 * null은 검사하지 않는다. Jint는 null을 정상적인 값으로 넘긴다
 * (원본 코드의 `player.sprite = null`, `putObject(x, y, null)`이 그 예다).
 */
const path = require("path");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..");
const ZEP_DECL = `${path.sep}zep-script${path.sep}`;

function loadProgram() {
	const configPath = path.join(ROOT, "tsconfig.json");
	const raw = ts.readConfigFile(configPath, ts.sys.readFile);
	if (raw.error) {
		throw new Error(ts.flattenDiagnosticMessageText(raw.error.messageText, "\n"));
	}
	const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, ROOT);
	return ts.createProgram(parsed.fileNames, parsed.options);
}

/** 유니온까지 펼쳐서 undefined가 섞여 있는지 본다 */
function hasUndefined(type) {
	if (type.flags & ts.TypeFlags.Undefined) return true;
	if (type.isUnion()) return type.types.some(hasUndefined);
	return false;
}

/** 이 호출이 zep-script 선언으로 해석되면 선언 파일 이름을 돌려준다 */
function zepDeclarationOf(checker, node) {
	const signature = checker.getResolvedSignature(node);
	const declaration = signature && signature.declaration;
	if (!declaration) return null;
	const fileName = declaration.getSourceFile().fileName;
	return fileName.split("/").join(path.sep).includes(ZEP_DECL) ? fileName : null;
}

function main() {
	const program = loadProgram();
	const checker = program.getTypeChecker();
	const problems = [];
	let zepCalls = 0;

	for (const source of program.getSourceFiles()) {
		if (source.isDeclarationFile) continue;
		if (!source.fileName.includes("/src/") && !source.fileName.endsWith("/main.ts")) continue;

		const visit = node => {
			if (ts.isCallExpression(node) && zepDeclarationOf(checker, node)) {
				zepCalls++;
				node.arguments.forEach((argument, index) => {
					if (!hasUndefined(checker.getTypeAtLocation(argument))) return;
					const { line, character } = source.getLineAndCharacterOfPosition(argument.getStart());
					problems.push({
						file: path.relative(ROOT, source.fileName),
						line: line + 1,
						column: character + 1,
						callee: node.expression.getText(),
						index: index + 1,
						argument: argument.getText(),
						type: checker.typeToString(checker.getTypeAtLocation(argument)),
					});
				});
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}

	// 아무 호출도 해석되지 않았다면 검사기가 고장난 것이다.
	// 조용히 통과시키면 있으나 마나 하므로 실패로 처리한다.
	if (zepCalls === 0) {
		console.error("check-zep-calls: ZEP API 호출을 하나도 찾지 못했습니다. 검사기가 깨졌습니다.");
		process.exit(2);
	}

	if (problems.length === 0) {
		console.log(`check-zep-calls: ZEP API 호출 ${zepCalls}건, undefined 인자 없음`);
		return;
	}

	console.error(`check-zep-calls: ZEP API에 undefined가 넘어가는 인자 ${problems.length}건\n`);
	for (const p of problems) {
		console.error(`  ${p.file}:${p.line}:${p.column}`);
		console.error(`    ${p.callee}() 의 ${p.index}번째 인자 \`${p.argument}\` : ${p.type}`);
	}
	console.error(
		"\n  Jint는 인자 개수로 오버로드를 고릅니다. undefined를 넘기지 말고," +
			"\n  인자를 아예 생략하도록 호출을 분기하거나 기본값을 주세요."
	);
	process.exit(1);
}

main();
