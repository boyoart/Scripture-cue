import type { BibleTranslationRecord } from "./bibleTypes";

const kjvGenesis1 = [
  "In the beginning God created the heaven and the earth.",
  "And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters.",
  "And God said, Let there be light: and there was light.",
  "And God saw the light, that it was good: and God divided the light from the darkness.",
  "And God called the light Day, and the darkness he called Night. And the evening and the morning were the first day.",
  "And God said, Let there be a firmament in the midst of the waters, and let it divide the waters from the waters.",
  "And God made the firmament, and divided the waters which were under the firmament from the waters which were above the firmament: and it was so.",
  "And God called the firmament Heaven. And the evening and the morning were the second day.",
  "And God said, Let the waters under the heaven be gathered together unto one place, and let the dry land appear: and it was so.",
  "And God called the dry land Earth; and the gathering together of the waters called he Seas: and God saw that it was good."
];

const webGenesis1 = [
  "In the beginning, God created the heavens and the earth.",
  "The earth was formless and empty. Darkness was on the surface of the deep and God’s Spirit was hovering over the surface of the waters.",
  "God said, \"Let there be light,\" and there was light.",
  "God saw the light, and saw that it was good. God divided the light from the darkness.",
  "God called the light Day, and the darkness he called Night. There was evening and there was morning, one day.",
  "God said, \"Let there be an expanse in the middle of the waters, and let it divide the waters from the waters.\"",
  "God made the expanse, and divided the waters which were under the expanse from the waters which were above the expanse; and it was so.",
  "God called the expanse sky. There was evening and there was morning, a second day.",
  "God said, \"Let the waters under the sky be gathered together to one place, and let the dry land appear;\" and it was so.",
  "God called the dry land Earth, and the gathering together of the waters he called Seas. God saw that it was good."
];

export const SEEDED_TRANSLATIONS: BibleTranslationRecord[] = [
  {
    code: "KJV",
    name: "King James Version",
    language: "en",
    publicDomain: true,
    license: "Public Domain",
    source: "Seeded from public-domain KJV excerpts for offline MVP bundling.",
    books: [
      {
        id: "genesis",
        name: "Genesis",
        abbreviations: ["gen", "ge", "gn"],
        chapters: [kjvGenesis1]
      },
      {
        id: "psalms",
        name: "Psalms",
        abbreviations: ["ps", "psa", "psalm"],
        chapters: [
          [
            "Blessed is the man that walketh not in the counsel of the ungodly..."
          ],
          [
            "Why do the heathen rage, and the people imagine a vain thing?"
          ],
          [
            "A Psalm of David, when he fled from Absalom his son."
          ],
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          [
            "The Lord is my shepherd; I shall not want.",
            "He maketh me to lie down in green pastures: he leadeth me beside the still waters.",
            "He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake.",
            "Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.",
            "Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over.",
            "Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the Lord for ever."
          ]
        ]
      },
      {
        id: "john",
        name: "John",
        abbreviations: ["jn", "jhn"],
        chapters: [
          [
            "In the beginning was the Word, and the Word was with God, and the Word was God.",
            "The same was in the beginning with God.",
            "All things were made by him; and without him was not any thing made that was made.",
            "In him was life; and the life was the light of men.",
            "And the light shineth in darkness; and the darkness comprehended it not."
          ],
          [],
          [
            "There was a man of the Pharisees, named Nicodemus, a ruler of the Jews:",
            "The same came to Jesus by night, and said unto him, Rabbi, we know that thou art a teacher come from God...",
            "Jesus answered and said unto him, Verily, verily, I say unto thee, Except a man be born again, he cannot see the kingdom of God.",
            "Nicodemus saith unto him, How can a man be born when he is old?...",
            "Jesus answered, Verily, verily, I say unto thee, Except a man be born of water and of the Spirit, he cannot enter into the kingdom of God.",
            "That which is born of the flesh is flesh; and that which is born of the Spirit is spirit.",
            "Marvel not that I said unto thee, Ye must be born again.",
            "The wind bloweth where it listeth...",
            "Nicodemus answered and said unto him, How can these things be?",
            "Jesus answered and said unto him, Art thou a master of Israel, and knowest not these things?",
            "Verily, verily, I say unto thee, We speak that we do know...",
            "If I have told you earthly things, and ye believe not, how shall ye believe, if I tell you of heavenly things?",
            "And no man hath ascended up to heaven, but he that came down from heaven...",
            "And as Moses lifted up the serpent in the wilderness, even so must the Son of man be lifted up:",
            "That whosoever believeth in him should not perish, but have eternal life.",
            "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
            "For God sent not his Son into the world to condemn the world; but that the world through him might be saved.",
            "He that believeth on him is not condemned..."
          ]
        ]
      },
      {
        id: "romans",
        name: "Romans",
        abbreviations: ["rom", "ro"],
        chapters: [
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          [
            "There is therefore now no condemnation to them which are in Christ Jesus...",
            "For the law of the Spirit of life in Christ Jesus hath made me free from the law of sin and death.",
            "For what the law could not do, in that it was weak through the flesh...",
            "That the righteousness of the law might be fulfilled in us, who walk not after the flesh, but after the Spirit.",
            "For they that are after the flesh do mind the things of the flesh...",
            "For to be carnally minded is death; but to be spiritually minded is life and peace.",
            "Because the carnal mind is enmity against God...",
            "So then they that are in the flesh cannot please God.",
            "But ye are not in the flesh, but in the Spirit...",
            "And if Christ be in you, the body is dead because of sin; but the Spirit is life because of righteousness.",
            "But if the Spirit of him that raised up Jesus from the dead dwell in you...",
            "Therefore, brethren, we are debtors, not to the flesh, to live after the flesh.",
            "For if ye live after the flesh, ye shall die...",
            "For as many as are led by the Spirit of God, they are the sons of God.",
            "For ye have not received the spirit of bondage again to fear...",
            "The Spirit itself beareth witness with our spirit, that we are the children of God:",
            "And if children, then heirs; heirs of God, and joint-heirs with Christ...",
            "For I reckon that the sufferings of this present time are not worthy to be compared with the glory which shall be revealed in us.",
            "For the earnest expectation of the creature waiteth for the manifestation of the sons of God.",
            "For the creature was made subject to vanity...",
            "Because the creature itself also shall be delivered from the bondage of corruption...",
            "For we know that the whole creation groaneth and travaileth in pain together until now.",
            "And not only they, but ourselves also...",
            "For we are saved by hope...",
            "But if we hope for that we see not, then do we with patience wait for it.",
            "Likewise the Spirit also helpeth our infirmities...",
            "And he that searcheth the hearts knoweth what is the mind of the Spirit...",
            "And we know that all things work together for good to them that love God, to them who are the called according to his purpose."
          ]
        ]
      }
    ]
  },
  {
    code: "WEB",
    name: "World English Bible",
    language: "en",
    publicDomain: true,
    license: "Public Domain",
    source: "Seeded from public-domain WEB excerpts for offline MVP bundling.",
    books: [
      {
        id: "genesis",
        name: "Genesis",
        abbreviations: ["gen", "ge", "gn"],
        chapters: [webGenesis1]
      },
      {
        id: "psalms",
        name: "Psalms",
        abbreviations: ["ps", "psa", "psalm"],
        chapters: [
          [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
          [
            "Yahweh is my shepherd: I shall lack nothing.",
            "He makes me lie down in green pastures. He leads me beside still waters.",
            "He restores my soul. He guides me in the paths of righteousness for his name’s sake.",
            "Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me. Your rod and your staff, they comfort me.",
            "You prepare a table before me in the presence of my enemies. You anoint my head with oil. My cup runs over.",
            "Surely goodness and loving kindness shall follow me all the days of my life, and I will dwell in Yahweh’s house forever."
          ]
        ]
      },
      {
        id: "john",
        name: "John",
        abbreviations: ["jn", "jhn"],
        chapters: [
          [
            "In the beginning was the Word, and the Word was with God, and the Word was God.",
            "The same was in the beginning with God.",
            "All things were made through him. Without him, nothing was made that has been made."
          ],
          [],
          [
            "Now there was a man of the Pharisees named Nicodemus, a ruler of the Jews.",
            "The same came to him by night, and said to him, Rabbi, we know that you are a teacher come from God...",
            "Jesus answered him, Most certainly, I tell you, unless one is born anew, he can’t see God’s Kingdom.",
            "Nicodemus said to him, How can a man be born when he is old?...",
            "Jesus answered, Most certainly I tell you, unless one is born of water and spirit, he can’t enter into God’s Kingdom.",
            "That which is born of the flesh is flesh. That which is born of the Spirit is spirit.",
            "Don’t marvel that I said to you, You must be born anew.",
            "The wind blows where it wants to...",
            "Nicodemus answered him, How can these things be?",
            "Jesus answered him, Are you the teacher of Israel, and don’t understand these things?",
            "Most certainly I tell you, we speak that which we know...",
            "If I told you earthly things and you don’t believe, how will you believe if I tell you heavenly things?",
            "No one has ascended into heaven, but he who descended out of heaven...",
            "As Moses lifted up the serpent in the wilderness, even so must the Son of Man be lifted up,",
            "that whoever believes in him should not perish, but have eternal life.",
            "For God so loved the world, that he gave his one and only Son, that whoever believes in him should not perish, but have eternal life.",
            "For God didn’t send his Son into the world to judge the world, but that the world should be saved through him.",
            "He who believes in him is not judged..."
          ]
        ]
      }
    ]
  }
];
