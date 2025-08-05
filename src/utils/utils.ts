const camelCasedMap = new Map();
export function camelCase(str: string) {
    if (camelCasedMap.has(str)) return camelCasedMap.get(str);

    const cleanedStr = str.replace(/[^a-zA-Z0-9$_]/g, " ");
    let words = cleanedStr.split(" ").filter(Boolean);
    for (let i = 1; i < words.length; i++) {
        words[i] = words[i].charAt(0).toUpperCase() + words[i].substring(1);
    }

    let result = words.join("");

    // If the first character is a number, prepend an underscore
    if (!isNaN(parseInt(result.charAt(0)))) {
        result = "_" + result;
    }

    camelCasedMap.set(str, result);

    return result;
}
