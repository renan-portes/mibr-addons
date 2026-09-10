import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseM3U } from "./m3uParser.js";
import type { TvChannel, TvCatalogFilter } from "./types.js";

// Default channels (Globo, SBT, Band, Record)
const DEFAULT_FALLBACK_M3U = `
#EXTM3U

# ==========================================
# 🇧🇷 TV ABERTA NACIONAL
# ==========================================

#EXTINF:-1 tvg-id="globo.sp" tvg-name="Globo SP" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/TV_Globo_2021.svg/512px-TV_Globo_2021.svg.png" group-title="Abertos",Globo SP HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Site%3Across-site&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/globosp/index.m3u8

#EXTINF:-1 tvg-id="globo.rj" tvg-name="Globo Rio" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/TV_Globo_2021.svg/512px-TV_Globo_2021.svg.png" group-title="Abertos",Globo Rio HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/globorj/index.m3u8

#EXTINF:-1 tvg-id="globo.mg" tvg-name="Globo Minas" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/TV_Globo_2021.svg/512px-TV_Globo_2021.svg.png" group-title="Abertos",Globo Minas HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Mode%3Acors/globomg/index.m3u8

#EXTINF:-1 tvg-id="globo.df" tvg-name="Globo Brasília" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/TV_Globo_2021.svg/512px-TV_Globo_2021.svg.png" group-title="Abertos",Globo Brasília HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Dest%3Aempty&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Site%3Across-site&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/globodf/index.m3u8

#EXTINF:-1 tvg-id="globo.es" tvg-name="Globo ES" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/TV_Globo_2021.svg/512px-TV_Globo_2021.svg.png" group-title="Abertos",Globo ES HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Sec-Fetch-Site%3Across-site/globoes/index.m3u8

#EXTINF:-1 tvg-id="globo.rs" tvg-name="Globo RS" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/TV_Globo_2021.svg/512px-TV_Globo_2021.svg.png" group-title="Abertos",Globo RS HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Mode%3Acors/globors/index.m3u8

#EXTINF:-1 tvg-id="sbt.sp" tvg-name="SBT SP" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Logo_do_SBT.svg/512px-Logo_do_SBT.svg.png" group-title="Abertos",SBT SP HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*/sbtsp/index.m3u8

#EXTINF:-1 tvg-id="sbt.rj" tvg-name="SBT Rio" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Logo_do_SBT.svg/512px-Logo_do_SBT.svg.png" group-title="Abertos",SBT Rio HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Site%3Across-site&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/sbtrj/index.m3u8

#EXTINF:-1 tvg-id="band.sp" tvg-name="Band SP" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Band_logo_2018.svg/512px-Band_logo_2018.svg.png" group-title="Abertos",Band SP HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Dest%3Aempty&h=Accept%3A*%2F*&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36/bandsp/index.m3u8

#EXTINF:-1 tvg-id="record.sp" tvg-name="Record SP" tvg-logo="https://upload.wikimedia.org/wikipedia/pt/thumb/a/a9/Logotipo_da_Record_2023.png/512px-Logotipo_da_Record_2023.png" group-title="Abertos",Record SP HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/recordsp/index.m3u8

#EXTINF:-1 tvg-id="record.rj" tvg-name="Record Rio" tvg-logo="https://upload.wikimedia.org/wikipedia/pt/thumb/a/a9/Logotipo_da_Record_2023.png/512px-Logotipo_da_Record_2023.png" group-title="Abertos",Record Rio HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept%3A*%2F*&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36/recordrj/index.m3u8

#EXTINF:-1 tvg-id="record.mg" tvg-name="Record Minas" tvg-logo="https://upload.wikimedia.org/wikipedia/pt/thumb/a/a9/Logotipo_da_Record_2023.png/512px-Logotipo_da_Record_2023.png" group-title="Abertos",Record Minas HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Site%3Across-site/recordmg/index.m3u8

#EXTINF:-1 tvg-id="record.df" tvg-name="Record Brasília" tvg-logo="https://upload.wikimedia.org/wikipedia/pt/thumb/a/a9/Logotipo_da_Record_2023.png/512px-Logotipo_da_Record_2023.png" group-title="Abertos",Record Brasília HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept%3A*%2F*&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz/recorddf/index.m3u8

#EXTINF:-1 tvg-id="record.es" tvg-name="Record ES" tvg-logo="https://upload.wikimedia.org/wikipedia/pt/thumb/a/a9/Logotipo_da_Record_2023.png/512px-Logotipo_da_Record_2023.png" group-title="Abertos",Record ES HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/recordes/index.m3u8

# ==========================================
# ⚽ ESPORTES & FUTEBOL
# ==========================================

#EXTINF:-1 tvg-id="band.sports" tvg-name="Band Sports" group-title="Esportes",Band Sports HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*&h=Sec-Fetch-Site%3Across-site&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/bandsports/index.m3u8

#EXTINF:-1 tvg-id="caze.tv" tvg-name="Cazé TV" group-title="Esportes",Cazé TV HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Site%3Across-site/cazetv/index.m3u8

#EXTINF:-1 tvg-id="combate" tvg-name="Combate" group-title="Esportes",Combate HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Site%3Across-site&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/combate/index.m3u8

#EXTINF:-1 tvg-id="dazn" tvg-name="DAZN" group-title="Esportes",DAZN HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Site%3Across-site&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/combate/index.m3u8

#EXTINF:-1 tvg-id="espn" tvg-name="ESPN" group-title="Esportes",ESPN HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/espn/index.m3u8

#EXTINF:-1 tvg-id="espn.2" tvg-name="ESPN 2" group-title="Esportes",ESPN 2 HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz/espn2/index.m3u8

#EXTINF:-1 tvg-id="espn.3" tvg-name="ESPN 3" group-title="Esportes",ESPN 3 HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/espn3/index.m3u8

#EXTINF:-1 tvg-id="espn.4" tvg-name="ESPN 4" group-title="Esportes",ESPN 4 HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*&h=Sec-Fetch-Site%3Across-site&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty/espn4/index.m3u8

#EXTINF:-1 tvg-id="espn.5" tvg-name="ESPN 5" group-title="Esportes",ESPN 5 HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Dest%3Aempty&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/espn5/index.m3u8

#EXTINF:-1 tvg-id="espn.6" tvg-name="ESPN 6" group-title="Esportes",ESPN 6 HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Site%3Across-site&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Mode%3Acors&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz/espn6/index.m3u8

#EXTINF:-1 tvg-id="ge.tv" tvg-name="GE TV" group-title="Esportes",GE TV HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Site%3Across-site/getv/index.m3u8

#EXTINF:-1 tvg-id="nsports" tvg-name="N Sports" group-title="Esportes",N Sports HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept%3A*%2F*/nsports/index.m3u8

#EXTINF:-1 tvg-id="nosso.futebol" tvg-name="Nosso Futebol" group-title="Esportes",Nosso Futebol HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Mode%3Acors&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty&h=Accept%3A*%2F*/nossofutebol/index.m3u8

#EXTINF:-1 tvg-id="premiere.clubes" tvg-name="Premiere Clubes" group-title="Esportes",Premiere Clubes HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Site%3Across-site/premiereclubes/index.m3u8

#EXTINF:-1 tvg-id="premiere.2" tvg-name="Premiere 2" group-title="Esportes",Premiere 2 HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Dest%3Aempty&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Mode%3Acors&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36/premiere2/index.m3u8

#EXTINF:-1 tvg-id="premiere.3" tvg-name="Premiere 3" group-title="Esportes",Premiere 3 HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors/premiere3/index.m3u8

#EXTINF:-1 tvg-id="premiere.4" tvg-name="Premiere 4" group-title="Esportes",Premiere 4 HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept%3A*%2F*/premiere4/index.m3u8

#EXTINF:-1 tvg-id="premiere.5" tvg-name="Premiere 5" group-title="Esportes",Premiere 5 HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Site%3Across-site&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*/premiere5/index.m3u8

#EXTINF:-1 tvg-id="premiere.6" tvg-name="Premiere 6" group-title="Esportes",Premiere 6 HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Sec-Fetch-Site%3Across-site&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/premiere6/index.m3u8

#EXTINF:-1 tvg-id="premiere.7" tvg-name="Premiere 7" group-title="Esportes",Premiere 7 HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36/premiere7/index.m3u8

#EXTINF:-1 tvg-id="premiere.8" tvg-name="Premiere 8" group-title="Esportes",Premiere 8 HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Mode%3Acors&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/premiere8/index.m3u8

#EXTINF:-1 tvg-id="sportv" tvg-name="SporTV" group-title="Esportes",SporTV HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Site%3Across-site&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36/sportv/index.m3u8

#EXTINF:-1 tvg-id="sportv.2" tvg-name="SporTV 2" group-title="Esportes",SporTV 2 HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*/sportv2/index.m3u8

#EXTINF:-1 tvg-id="sportv.3" tvg-name="SporTV 3" group-title="Esportes",SporTV 3 HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Site%3Across-site&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Mode%3Acors/sportv3/index.m3u8

#EXTINF:-1 tvg-id="x.sports" tvg-name="X Sports" group-title="Esportes",X Sports HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept%3A*%2F*&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Mode%3Acors&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/xsports/index.m3u8

# ==========================================
# 🎬 STREAMING
# ==========================================

#EXTINF:-1 tvg-id="amazon.prime" tvg-name="Amazon Prime" group-title="Streaming",Amazon Prime Video 1
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Dest%3Aempty&h=Accept%3A*%2F*/amazonprime/index.m3u8

#EXTINF:-1 tvg-id="amazon.prime.2" tvg-name="Amazon Prime 2" group-title="Streaming",Amazon Prime Video 2
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Site%3Across-site/amazonprime02/index.m3u8

#EXTINF:-1 tvg-id="amazon.prime.3" tvg-name="Amazon Prime 3" group-title="Streaming",Amazon Prime Video 3
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Site%3Across-site&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*/amazonprime03/index.m3u8

#EXTINF:-1 tvg-id="amazon.prime.4" tvg-name="Amazon Prime 4" group-title="Streaming",Amazon Prime Video 4
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Mode%3Acors/amazonprime04/index.m3u8

#EXTINF:-1 tvg-id="amazon.prime.5" tvg-name="Amazon Prime 5" group-title="Streaming",Amazon Prime Video 5
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/amazonprime05/index.m3u8

#EXTINF:-1 tvg-id="apple.tv.1" tvg-name="Apple TV 1" group-title="Streaming",Apple TV+ 1
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty/appletv01/index.m3u8

#EXTINF:-1 tvg-id="apple.tv.2" tvg-name="Apple TV 2" group-title="Streaming",Apple TV+ 2
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Site%3Across-site&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/appletv02/index.m3u8

#EXTINF:-1 tvg-id="disney.plus" tvg-name="Disney Plus" group-title="Streaming",Disney+ 1
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty/disneyplus/index.m3u8

#EXTINF:-1 tvg-id="disney.plus.2" tvg-name="Disney Plus 2" group-title="Streaming",Disney+ 2
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/disneyplus02/index.m3u8

#EXTINF:-1 tvg-id="disney.plus.3" tvg-name="Disney Plus 3" group-title="Streaming",Disney+ 3
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Mode%3Acors/disneyplus03/index.m3u8

#EXTINF:-1 tvg-id="disney.plus.4" tvg-name="Disney Plus 4" group-title="Streaming",Disney+ 4
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Site%3Across-site&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz/disneyplus04/index.m3u8

#EXTINF:-1 tvg-id="disney.plus.5" tvg-name="Disney Plus 5" group-title="Streaming",Disney+ 5
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/disneyplus05/index.m3u8

#EXTINF:-1 tvg-id="disney.plus.6" tvg-name="Disney Plus 6" group-title="Streaming",Disney+ 6
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/disneyplus06/index.m3u8

#EXTINF:-1 tvg-id="globoplay.novelas" tvg-name="Globoplay Novelas" group-title="Streaming",Globoplay Novelas
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*/globoplaynovelas/index.m3u8

#EXTINF:-1 tvg-id="max" tvg-name="Max" group-title="Streaming",Max 1
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/max/index.m3u8

#EXTINF:-1 tvg-id="max.2" tvg-name="Max 2" group-title="Streaming",Max 2
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors/max02/index.m3u8

#EXTINF:-1 tvg-id="max.3" tvg-name="Max 3" group-title="Streaming",Max 3
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors/max03/index.m3u8

#EXTINF:-1 tvg-id="max.4" tvg-name="Max 4" group-title="Streaming",Max 4
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Mode%3Acors&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Dest%3Aempty&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*/max04/index.m3u8

#EXTINF:-1 tvg-id="max.5" tvg-name="Max 5" group-title="Streaming",Max 5
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*/max05/index.m3u8

#EXTINF:-1 tvg-id="max.6" tvg-name="Max 6" group-title="Streaming",Max 6
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Dest%3Aempty&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Mode%3Acors&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Site%3Across-site&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz/max06/index.m3u8

#EXTINF:-1 tvg-id="paramount.plus" tvg-name="Paramount+" group-title="Streaming",Paramount+ 1
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Mode%3Acors&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/paramountplus/index.m3u8

#EXTINF:-1 tvg-id="paramount.plus.2" tvg-name="Paramount+ 2" group-title="Streaming",Paramount+ 2
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Site%3Across-site/paramountplus02/index.m3u8
# ==========================================
# 🧸 INFANTIL
# ==========================================

#EXTINF:-1 tvg-id="cartoonito" tvg-name="Cartoonito" group-title="Infantil",Cartoonito HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors/cartoonito/index.m3u8

#EXTINF:-1 tvg-id="cartoon.network" tvg-name="Cartoon Network" group-title="Infantil",Cartoon Network HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36/cartoonnetwork/index.m3u8

#EXTINF:-1 tvg-id="discovery.kids" tvg-name="Discovery Kids" group-title="Infantil",Discovery Kids HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept%3A*%2F*&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Site%3Across-site&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/discoverykids/index.m3u8

#EXTINF:-1 tvg-id="gloob" tvg-name="Gloob" group-title="Infantil",Gloob HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Mode%3Acors&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Site%3Across-site&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Dest%3Aempty/gloob/index.m3u8

#EXTINF:-1 tvg-id="gloobinho" tvg-name="Gloobinho" group-title="Infantil",Gloobinho HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Mode%3Acors&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*/gloobinho/index.m3u8

#EXTINF:-1 tvg-id="nickelodeon" tvg-name="Nickelodeon" group-title="Infantil",Nickelodeon HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Dest%3Aempty&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Site%3Across-site/nickelodeon/index.m3u8

#EXTINF:-1 tvg-id="nick.jr" tvg-name="Nick Jr" group-title="Infantil",Nick Jr HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Sec-Fetch-Site%3Across-site&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36/nickjr/index.m3u8

#EXTINF:-1 tvg-id="tooncast" tvg-name="Tooncast" group-title="Infantil",Tooncast HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Site%3Across-site/tooncast/index.m3u8


# ==========================================
# 🌍 DOCUMENTÁRIOS
# ==========================================

#EXTINF:-1 tvg-id="animal.planet" tvg-name="Animal Planet" group-title="Documentários",Animal Planet HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty/animalplanet/index.m3u8

#EXTINF:-1 tvg-id="canal.off" tvg-name="Canal Off" group-title="Documentários",Canal Off HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept%3A*%2F*&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Dest%3Aempty/canaloff/index.m3u8

#EXTINF:-1 tvg-id="discovery.channel" tvg-name="Discovery Channel" group-title="Documentários",Discovery Channel HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Site%3Across-site&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Dest%3Aempty&h=Accept%3A*%2F*&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36/discoverychannel/index.m3u8

#EXTINF:-1 tvg-id="discovery.hh" tvg-name="Discovery Home & Health" group-title="Documentários",Discovery Home & Health HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Mode%3Acors&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz/discoveryhh/index.m3u8

#EXTINF:-1 tvg-id="discovery.id" tvg-name="Investigation Discovery" group-title="Documentários",Investigation Discovery HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept%3A*%2F*&h=Sec-Fetch-Site%3Across-site&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors/discoveryid/index.m3u8

#EXTINF:-1 tvg-id="discovery.science" tvg-name="Discovery Science" group-title="Documentários",Discovery Science HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/discoveryscience/index.m3u8

#EXTINF:-1 tvg-id="discovery.theater" tvg-name="Discovery Theater" group-title="Documentários",Discovery Theater HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Dest%3Aempty&h=Accept%3A*%2F*&h=Sec-Fetch-Site%3Across-site/discoverytheater/index.m3u8

#EXTINF:-1 tvg-id="discovery.turbo" tvg-name="Discovery Turbo" group-title="Documentários",Discovery Turbo HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Dest%3Aempty&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/discoveryturbo/index.m3u8

#EXTINF:-1 tvg-id="discovery.world" tvg-name="Discovery World" group-title="Documentários",Discovery World HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty&h=Accept%3A*%2F*&h=Sec-Fetch-Site%3Across-site/discoveryworld/index.m3u8

#EXTINF:-1 tvg-id="food.network" tvg-name="Food Network" group-title="Documentários",Food Network HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Mode%3Acors&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/foodnetwork/index.m3u8

#EXTINF:-1 tvg-id="history" tvg-name="History Channel" group-title="Documentários",History Channel HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Site%3Across-site&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/history/index.m3u8

#EXTINF:-1 tvg-id="history.2" tvg-name="History 2" group-title="Documentários",History 2 HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Mode%3Acors&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept%3A*%2F*&h=Sec-Fetch-Site%3Across-site&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Dest%3Aempty/history2/index.m3u8


# ==========================================
# 🍿 FILMES & SÉRIES
# ==========================================

#EXTINF:-1 tvg-id="ae" tvg-name="A&E" group-title="Filmes & Séries",A&E HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz/aee/index.m3u8

#EXTINF:-1 tvg-id="amc" tvg-name="AMC" group-title="Filmes & Séries",AMC HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/amc/index.m3u8

#EXTINF:-1 tvg-id="axn" tvg-name="AXN" group-title="Filmes & Séries",AXN HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Site%3Across-site&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz/axn/index.m3u8

#EXTINF:-1 tvg-id="cinemax" tvg-name="Cinemax" group-title="Filmes & Séries",Cinemax HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36/cinemax/index.m3u8

#EXTINF:-1 tvg-id="hbo" tvg-name="HBO" group-title="Filmes & Séries",HBO HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Dest%3Aempty&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36/hbo/index.m3u8

#EXTINF:-1 tvg-id="hbo.2" tvg-name="HBO 2" group-title="Filmes & Séries",HBO 2 HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/hbo2/index.m3u8

#EXTINF:-1 tvg-id="hbo.family" tvg-name="HBO Family" group-title="Filmes & Séries",HBO Family HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/hbofamily/index.m3u8

#EXTINF:-1 tvg-id="hbo.mundi" tvg-name="HBO Mundi" group-title="Filmes & Séries",HBO Mundi HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Mode%3Acors&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty/hbomundi/index.m3u8

#EXTINF:-1 tvg-id="hbo.plus" tvg-name="HBO Plus" group-title="Filmes & Séries",HBO Plus HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Mode%3Acors&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty/hboplus/index.m3u8

#EXTINF:-1 tvg-id="hbo.pop" tvg-name="HBO Pop" group-title="Filmes & Séries",HBO Pop HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*&h=Sec-Fetch-Site%3Across-site&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors/hbopop/index.m3u8

#EXTINF:-1 tvg-id="hbo.signature" tvg-name="HBO Signature" group-title="Filmes & Séries",HBO Signature HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Mode%3Acors&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept%3A*%2F*/hbosignature/index.m3u8

#EXTINF:-1 tvg-id="hbo.xtreme" tvg-name="HBO Xtreme" group-title="Filmes & Séries",HBO Xtreme HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/hboxtreme/index.m3u8

#EXTINF:-1 tvg-id="megapix" tvg-name="Megapix" group-title="Filmes & Séries",Megapix HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept%3A*%2F*&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/megapix/index.m3u8

#EXTINF:-1 tvg-id="paramount.network" tvg-name="Paramount Network" group-title="Filmes & Séries",Paramount Network HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Dest%3Aempty&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/paramountnetwork/index.m3u8

#EXTINF:-1 tvg-id="sony.channel" tvg-name="Sony Channel" group-title="Filmes & Séries",Sony Channel HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36/sonychannel/index.m3u8

#EXTINF:-1 tvg-id="space" tvg-name="Space" group-title="Filmes & Séries",Space HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Dest%3Aempty&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36/space/index.m3u8

#EXTINF:-1 tvg-id="studio.universal" tvg-name="Studio Universal" group-title="Filmes & Séries",Studio Universal HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty/studiouniversal/index.m3u8

#EXTINF:-1 tvg-id="telecine.action" tvg-name="Telecine Action" group-title="Filmes & Séries",Telecine Action HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept%3A*%2F*&h=Sec-Fetch-Mode%3Acors/tcaction/index.m3u8

#EXTINF:-1 tvg-id="telecine.cult" tvg-name="Telecine Cult" group-title="Filmes & Séries",Telecine Cult HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Site%3Across-site&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty/tccult/index.m3u8

#EXTINF:-1 tvg-id="telecine.fun" tvg-name="Telecine Fun" group-title="Filmes & Séries",Telecine Fun HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Site%3Across-site&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz/tcfun/index.m3u8

#EXTINF:-1 tvg-id="telecine.pipoca" tvg-name="Telecine Pipoca" group-title="Filmes & Séries",Telecine Pipoca HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Site%3Across-site&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz/tcpipoca/index.m3u8

#EXTINF:-1 tvg-id="telecine.premium" tvg-name="Telecine Premium" group-title="Filmes & Séries",Telecine Premium HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Mode%3Acors&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty/tcpremium/index.m3u8

#EXTINF:-1 tvg-id="telecine.touch" tvg-name="Telecine Touch" group-title="Filmes & Séries",Telecine Touch HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8/tcpremium/index.m3u8

#EXTINF:-1 tvg-id="tnt" tvg-name="TNT" group-title="Filmes & Séries",TNT HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept%3A*%2F*&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F/tnt/index.m3u8

#EXTINF:-1 tvg-id="tnt.novelas" tvg-name="TNT Novelas" group-title="Filmes & Séries",TNT Novelas HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Mode%3Acors&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept%3A*%2F*&h=Sec-Fetch-Site%3Across-site&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Dest%3Aempty/tntnovelas/index.m3u8

#EXTINF:-1 tvg-id="tnt.series" tvg-name="TNT Series" group-title="Filmes & Séries",TNT Series HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Dest%3Aempty&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Site%3Across-site&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36/tntseries/index.m3u8

#EXTINF:-1 tvg-id="universal.tv" tvg-name="Universal TV" group-title="Filmes & Séries",Universal TV HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz/universaltv/index.m3u8

#EXTINF:-1 tvg-id="warner.channel" tvg-name="Warner Channel" group-title="Filmes & Séries",Warner Channel HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Site%3Across-site&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept%3A*%2F*&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36/warner/index.m3u8


# ==========================================
# 🎭 ENTRETENIMENTO
# ==========================================

#EXTINF:-1 tvg-id="adult.swim" tvg-name="Adult Swim" group-title="Entretenimento",Adult Swim HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36/adultswim/index.m3u8

#EXTINF:-1 tvg-id="comedy.central" tvg-name="Comedy Central" group-title="Entretenimento",Comedy Central HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Site%3Across-site&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz/comedycentral/index.m3u8

#EXTINF:-1 tvg-id="gnt" tvg-name="GNT" group-title="Entretenimento",GNT HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Mode%3Acors&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Sec-Fetch-Dest%3Aempty/gnt/index.m3u8

#EXTINF:-1 tvg-id="mtv" tvg-name="MTV" group-title="Entretenimento",MTV HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Accept%3A*%2F*&h=Sec-Fetch-Mode%3Acors&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site/mtv/index.m3u8

#EXTINF:-1 tvg-id="multishow" tvg-name="Multishow" group-title="Entretenimento",Multishow HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Dest%3Aempty&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Mode%3Acors/multishow/index.m3u8


# ==========================================
# 📰 NOTÍCIAS
# ==========================================

#EXTINF:-1 tvg-id="band.news" tvg-name="Band News" group-title="Notícias",Band News HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Accept%3A*%2F*&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Site%3Across-site&h=Sec-Fetch-Dest%3Aempty/bandnews/index.m3u8

#EXTINF:-1 tvg-id="cnn.brasil" tvg-name="CNN Brasil" group-title="Notícias",CNN Brasil HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Sec-Fetch-Site%3Across-site&h=Accept%3A*%2F*&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors/cnnbrasil/index.m3u8

#EXTINF:-1 tvg-id="globo.news" tvg-name="Globo News" group-title="Notícias",Globo News HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept%3A*%2F*&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Site%3Across-site&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Dest%3Aempty&h=Sec-Fetch-Mode%3Acors&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz/globonews/index.m3u8

#EXTINF:-1 tvg-id="jovem.pan.news" tvg-name="Jovem Pan News" group-title="Notícias",Jovem Pan News HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept%3A*%2F*&h=Sec-Fetch-Mode%3Acors&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=Sec-Fetch-Site%3Across-site&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty/jovempannews/index.m3u8

#EXTINF:-1 tvg-id="record.news" tvg-name="Record News" group-title="Notícias",Record News HD
http://127.0.0.1:11470/proxy/d=https%3A%2F%2Fywppjexvlyulasvmgzjdftfjikth0909oq80soveui6lkbi2iza2al.cdn12embed.xyz&h=Accept-Language%3Apt-BR%2Cpt%3Bq%3D0.9%2Cen%3Bq%3D0.8&h=User-Agent%3AMozilla%2F5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36&h=Sec-Fetch-Dest%3Aempty&h=Accept%3A*%2F*&h=Origin%3Ahttps%3A%2F%2Fcdnembedcanais.xyz&h=Sec-Fetch-Site%3Across-site&h=Referer%3Ahttps%3A%2F%2Fcdnembedcanais.xyz%2F&h=Sec-Fetch-Mode%3Acors/recordnews/index.m3u8
`.trim();

export interface ChannelStoreOptions {
  readonly m3uPath?: string;
  readonly m3uUrl?: string;
  readonly initialContent?: string;
}

export class ChannelStore {
  private channels: TvChannel[] = [];
  private channelsById: Map<string, TvChannel> = new Map();
  private readonly m3uPath?: string;
  private readonly m3uUrl?: string;

  constructor(options?: ChannelStoreOptions) {
    this.m3uPath = options?.m3uPath ?? process.env.CHANNELS_M3U_PATH ?? "./data/channels.m3u";
    this.m3uUrl = options?.m3uUrl ?? process.env.CHANNELS_M3U_URL;

    if (options?.initialContent) {
      this.loadFromContent(options.initialContent);
    } else {
      this.reloadSync();
    }
  }

  loadFromContent(content: string): void {
    const parsed = parseM3U(content);
    this.setChannels(parsed);
  }

  reloadSync(): void {
    if (this.m3uPath) {
      const resolvedPath = resolve(process.cwd(), this.m3uPath);
      if (existsSync(resolvedPath)) {
        try {
          const content = readFileSync(resolvedPath, "utf8");
          const parsed = parseM3U(content);
          if (parsed.length > 0) {
            this.setChannels(parsed);
            return;
          }
        } catch (error) {
          console.error(`[ChannelStore] Error reading M3U file at ${resolvedPath}:`, error);
        }
      }
    }

    // If local file not found or empty, load fallback
    this.loadFromContent(DEFAULT_FALLBACK_M3U);
  }

  async reload(): Promise<void> {
    if (this.m3uUrl) {
      try {
        const response = await fetch(this.m3uUrl, {
          headers: { "User-Agent": "MIBR-TV/1.0" },
        });
        if (response.ok) {
          const content = await response.text();
          const parsed = parseM3U(content);
          if (parsed.length > 0) {
            this.setChannels(parsed);
            return;
          }
        }
      } catch (error) {
        console.error(`[ChannelStore] Error fetching remote M3U at ${this.m3uUrl}:`, error);
      }
    }

    this.reloadSync();
  }

  private setChannels(channels: TvChannel[]): void {
    this.channels = channels;
    this.channelsById.clear();
    for (const ch of channels) {
      this.channelsById.set(ch.id, ch);
    }
  }

  getChannels(filter?: TvCatalogFilter): TvChannel[] {
    let result = this.channels;

    if (filter?.genre) {
      const targetGenre = filter.genre.toLowerCase();
      result = result.filter((ch) => ch.group.toLowerCase() === targetGenre);
    }

    if (filter?.search) {
      const query = filter.search.toLowerCase();
      result = result.filter((ch) => ch.name.toLowerCase().includes(query));
    }

    const skip = filter?.skip ?? 0;
    const limit = filter?.limit ?? 500;

    return result.slice(skip, skip + limit);
  }

  getChannelById(id: string): TvChannel | undefined {
    return this.channelsById.get(id);
  }

  getGenres(): string[] {
    const genres = new Set<string>();
    for (const ch of this.channels) {
      if (ch.group) {
        genres.add(ch.group);
      }
    }
    return Array.from(genres).sort();
  }

  getStats(): { totalChannels: number; genres: Record<string, number> } {
    const genreCounts: Record<string, number> = {};
    for (const ch of this.channels) {
      genreCounts[ch.group] = (genreCounts[ch.group] ?? 0) + 1;
    }

    return {
      totalChannels: this.channels.length,
      genres: genreCounts,
    };
  }
}

let defaultStoreInstance: ChannelStore | undefined;

export function getDefaultChannelStore(): ChannelStore {
  if (!defaultStoreInstance) {
    defaultStoreInstance = new ChannelStore();
  }
  return defaultStoreInstance;
}
