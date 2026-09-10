import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseM3U } from "./m3uParser.js";
import type { TvChannel, TvCatalogFilter } from "./types.js";

// Default channels (Globo, SBT, Band, Record)
const DEFAULT_FALLBACK_M3U = `
#EXTM3U

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
    const limit = filter?.limit ?? 100;

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
