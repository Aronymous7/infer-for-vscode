export const INFER_OUTPUT_DIRECTORY = '/tmp/infer-out';
export const SIGNIFICANT_CODE_CHANGE_REGEX = new RegExp(/(while *\(.+\)|for *\(.+\)|[A-Za-z_$][A-Za-z0-9_]+(?<!if|switch)\(.*\))/g);
export const METHOD_DECLARATION_REGEX = new RegExp(/^(?:public|protected|private|static|final|native|synchronized|abstract|transient|\t| )+[\w\<\>\[\]]+\s+([A-Za-z_$][A-Za-z0-9_]+)(?<!if|switch|while|for)\([^\)]*\) *(?:\{(?:.*\})?|;)?/gm);